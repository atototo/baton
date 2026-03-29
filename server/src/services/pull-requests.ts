import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { conflict } from "../errors.js";

const execFile = promisify(execFileCb);

function readNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRepoUrl(value: string) {
  return value.replace(/\.git$/i, "");
}

function repoSlugFromUrl(value: string | null): { slug: string; hostname: string } | null {
  const normalized = readNonEmptyString(value);
  if (!normalized) return null;
  const match = normalizeRepoUrl(normalized).match(/(github(?:\.[a-z0-9-]+)*\.com)[:/](.+?)\/(.+?)(?:\/)?$/i);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  return { slug: `${match[2]}/${match[3]}`, hostname: match[1] };
}

export interface PullRequestExecutionInput {
  cwd: string;
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  preferredRepoUrl?: string | null;
  commitMessage?: string | null;
}

export interface PullRequestExecutionResult {
  repository: string;
  repoUrl: string;
  branch: string;
  baseBranch: string;
  commitCreated: boolean;
  commitSha: string | null;
  pullRequestUrl: string;
  pullRequestNumber: number | null;
}

export interface WorkingTreeChangeSummary {
  paths: string[];
}

export interface PullRequestConflictSummary {
  phase: "merge";
  baseBranch: string;
  branch: string;
  conflictedPaths: string[];
  autoResolutionAttempted: boolean;
  autoResolutionSucceeded: boolean;
  agentRecoveryAttempted: boolean;
  agentRecoverySucceeded: boolean;
  lastError: string | null;
}

export interface PullRequestPreparationResult {
  branch: string;
  baseBranch: string;
  baseCommitSha: string | null;
  branchCommitSha: string | null;
  changedPaths: string[];
  syncStatus: "verified" | "conflicted";
  conflictSummary: PullRequestConflictSummary | null;
}

export interface PullRequestDriftInspectionResult {
  branch: string;
  baseBranch: string;
  storedBaseCommitSha: string | null;
  latestBaseCommitSha: string | null;
  drifted: boolean;
}

async function runCommand(command: string, args: string[], cwd: string, env?: Record<string, string>) {
  return execFile(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined });
}

async function runGit(cwd: string, args: string[]) {
  return runCommand("git", args, cwd);
}

async function runGh(cwd: string, args: string[], ghHost?: string) {
  return runCommand("gh", args, cwd, ghHost && ghHost !== "github.com" ? { GH_HOST: ghHost } : undefined);
}

async function resolveRepoUrl(cwd: string, preferredRepoUrl?: string | null) {
  const preferred = readNonEmptyString(preferredRepoUrl);
  if (preferred) return normalizeRepoUrl(preferred);
  const { stdout } = await runGit(cwd, ["remote", "get-url", "origin"]);
  const remote = readNonEmptyString(stdout);
  if (!remote) throw conflict("Cannot create a pull request without a configured repository remote.");
  return normalizeRepoUrl(remote);
}

async function resolveCurrentBranch(cwd: string) {
  const { stdout } = await runGit(cwd, ["branch", "--show-current"]);
  const branch = readNonEmptyString(stdout);
  if (!branch) throw conflict("Cannot determine the current git branch for the execution workspace.");
  return branch;
}

async function checkoutBranch(cwd: string, branch: string) {
  await runGit(cwd, ["checkout", branch]);
}

async function hasWorkingTreeChanges(cwd: string) {
  const { stdout } = await runGit(cwd, ["status", "--porcelain", "--untracked-files=all"]);
  return stdout.trim().length > 0;
}

async function listWorkingTreeChangePaths(cwd: string) {
  const { stdout } = await runGit(cwd, ["status", "--porcelain", "--untracked-files=all"]);
  const paths = stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).trim())
    .filter((line) => line.length > 0);
  return Array.from(new Set(paths));
}

async function listChangedPathsBetween(cwd: string, fromRef: string, toRef: string) {
  const { stdout } = await runGit(cwd, ["diff", "--name-only", `${fromRef}...${toRef}`]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function revParse(cwd: string, rev: string) {
  try {
    const { stdout } = await runGit(cwd, ["rev-parse", rev]);
    return readNonEmptyString(stdout);
  } catch {
    return null;
  }
}

async function fetchBranch(cwd: string, remote: string, branch: string) {
  await runGit(cwd, ["fetch", remote, branch]);
}

async function mergeBaseIntoBranch(cwd: string, baseRef: string) {
  await runGit(cwd, ["merge", "--no-ff", "--no-edit", baseRef]);
}

async function listConflictedPaths(cwd: string) {
  const { stdout } = await runGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function abortMerge(cwd: string) {
  try {
    await runGit(cwd, ["merge", "--abort"]);
  } catch {
    // ignore abort failures; caller will surface original error
  }
}

async function createCommitIfNeeded(cwd: string, commitMessage: string) {
  const dirty = await hasWorkingTreeChanges(cwd);
  if (!dirty) return { created: false, sha: null as string | null };

  await runGit(cwd, ["add", "-A"]);
  await runGit(cwd, ["commit", "-m", commitMessage]);
  const { stdout } = await runGit(cwd, ["rev-parse", "HEAD"]);
  return { created: true, sha: readNonEmptyString(stdout) };
}

async function pushBranch(cwd: string, branch: string) {
  await runGit(cwd, ["push", "-u", "origin", branch]);
}

async function findExistingPullRequest(cwd: string, repository: string, branch: string, ghHost?: string) {
  try {
    const { stdout } = await runGh(cwd, ["pr", "list", "--repo", repository, "--head", branch, "--state", "open", "--json", "url,number"], ghHost);
    const rows = JSON.parse(stdout) as Array<{ url?: string; number?: number }>;
    const first = rows[0];
    if (!first?.url) return null;
    return {
      pullRequestUrl: first.url,
      pullRequestNumber: typeof first.number === "number" ? first.number : null,
    };
  } catch {
    return null;
  }
}

async function createPullRequest(args: {
  cwd: string;
  repository: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  ghHost?: string;
}) {
  const { cwd, repository, branch, baseBranch, title, body, ghHost } = args;
  const existing = await findExistingPullRequest(cwd, repository, branch, ghHost);
  if (existing) return existing;

  const { stdout } = await runGh(cwd, [
    "pr",
    "create",
    "--repo",
    repository,
    "--head",
    branch,
    "--base",
    baseBranch,
    "--title",
    title,
    "--body",
    body,
  ], ghHost);
  const url = readNonEmptyString(stdout);
  if (!url) throw conflict("Pull request creation succeeded but no URL was returned.");

  const created = await findExistingPullRequest(cwd, repository, branch, ghHost);
  return {
    pullRequestUrl: created?.pullRequestUrl ?? url,
    pullRequestNumber: created?.pullRequestNumber ?? null,
  };
}

export function pullRequestService() {
  return {
    summarizeWorkingTreeChanges: async (cwd: string): Promise<WorkingTreeChangeSummary> => ({
      paths: await listWorkingTreeChangePaths(cwd),
    }),

    prepareForPullRequest: async (input: {
      cwd: string;
      branch: string;
      baseBranch: string;
    }): Promise<PullRequestPreparationResult> => {
      const branch = readNonEmptyString(input.branch) ?? (await resolveCurrentBranch(input.cwd));
      const baseBranch = readNonEmptyString(input.baseBranch) ?? "main";
      await checkoutBranch(input.cwd, branch);
      await fetchBranch(input.cwd, "origin", baseBranch);
      const baseRef = `origin/${baseBranch}`;
      const baseCommitSha = await revParse(input.cwd, baseRef);

      try {
        await mergeBaseIntoBranch(input.cwd, baseRef);
      } catch (error) {
        const conflictedPaths = await listConflictedPaths(input.cwd);
        await abortMerge(input.cwd);
        return {
          branch,
          baseBranch,
          baseCommitSha,
          branchCommitSha: await revParse(input.cwd, "HEAD"),
          changedPaths: [],
          syncStatus: "conflicted",
          conflictSummary: {
            phase: "merge",
            baseBranch,
            branch,
            conflictedPaths,
            autoResolutionAttempted: true,
            autoResolutionSucceeded: false,
            agentRecoveryAttempted: false,
            agentRecoverySucceeded: false,
            lastError: error instanceof Error ? error.message : String(error),
          },
        };
      }

      return {
        branch,
        baseBranch,
        baseCommitSha,
        branchCommitSha: await revParse(input.cwd, "HEAD"),
        changedPaths: await listChangedPathsBetween(input.cwd, baseRef, "HEAD"),
        syncStatus: "verified",
        conflictSummary: null,
      };
    },

    inspectPullRequestDrift: async (input: {
      cwd: string;
      branch: string;
      baseBranch: string;
      storedBaseCommitSha: string | null;
    }): Promise<PullRequestDriftInspectionResult> => {
      const branch = readNonEmptyString(input.branch) ?? (await resolveCurrentBranch(input.cwd));
      const baseBranch = readNonEmptyString(input.baseBranch) ?? "main";
      await checkoutBranch(input.cwd, branch);
      await fetchBranch(input.cwd, "origin", baseBranch);
      const latestBaseCommitSha = await revParse(input.cwd, `origin/${baseBranch}`);
      return {
        branch,
        baseBranch,
        storedBaseCommitSha: readNonEmptyString(input.storedBaseCommitSha),
        latestBaseCommitSha,
        drifted:
          !!latestBaseCommitSha &&
          !!readNonEmptyString(input.storedBaseCommitSha) &&
          latestBaseCommitSha !== readNonEmptyString(input.storedBaseCommitSha),
      };
    },

    openForExecutionWorkspace: async (input: PullRequestExecutionInput): Promise<PullRequestExecutionResult> => {
      const cwd = input.cwd;
      const repositoryUrl = await resolveRepoUrl(cwd, input.preferredRepoUrl);
      const repoInfo = repoSlugFromUrl(repositoryUrl);
      if (!repoInfo) {
        throw conflict("Only GitHub remotes are currently supported for Baton pull request creation.");
      }

      const branch = readNonEmptyString(input.branch) ?? (await resolveCurrentBranch(cwd));
      const baseBranch = readNonEmptyString(input.baseBranch) ?? "main";
      const commitMessage =
        readNonEmptyString(input.commitMessage) ??
        `chore(${branch}): prepare changes for review`;

      const commitResult = await createCommitIfNeeded(cwd, commitMessage);
      await pushBranch(cwd, branch);
      const pullRequest = await createPullRequest({
        cwd,
        repository: repoInfo.slug,
        branch,
        baseBranch,
        title: input.title,
        body: input.body,
        ghHost: repoInfo.hostname,
      });

      return {
        repository: repoInfo.slug,
        repoUrl: repositoryUrl,
        branch,
        baseBranch,
        commitCreated: commitResult.created,
        commitSha: commitResult.sha,
        pullRequestUrl: pullRequest.pullRequestUrl,
        pullRequestNumber: pullRequest.pullRequestNumber,
      };
    },
  };
}
