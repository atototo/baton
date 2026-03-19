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

function repoSlugFromUrl(value: string | null) {
  const normalized = readNonEmptyString(value);
  if (!normalized) return null;
  const match = normalizeRepoUrl(normalized).match(/github\.com[:/](.+?)\/(.+?)(?:\/)?$/i);
  if (!match?.[1] || !match?.[2]) return null;
  return `${match[1]}/${match[2]}`;
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

async function runCommand(command: string, args: string[], cwd: string) {
  return execFile(command, args, { cwd });
}

async function runGit(cwd: string, args: string[]) {
  return runCommand("git", args, cwd);
}

async function runGh(cwd: string, args: string[]) {
  return runCommand("gh", args, cwd);
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

async function findExistingPullRequest(cwd: string, repository: string, branch: string) {
  try {
    const { stdout } = await runGh(cwd, ["pr", "list", "--repo", repository, "--head", branch, "--state", "open", "--json", "url,number"]);
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
}) {
  const { cwd, repository, branch, baseBranch, title, body } = args;
  const existing = await findExistingPullRequest(cwd, repository, branch);
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
  ]);
  const url = readNonEmptyString(stdout);
  if (!url) throw conflict("Pull request creation succeeded but no URL was returned.");

  const created = await findExistingPullRequest(cwd, repository, branch);
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

    openForExecutionWorkspace: async (input: PullRequestExecutionInput): Promise<PullRequestExecutionResult> => {
      const cwd = input.cwd;
      const repositoryUrl = await resolveRepoUrl(cwd, input.preferredRepoUrl);
      const repository = repoSlugFromUrl(repositoryUrl);
      if (!repository) {
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
        repository,
        branch,
        baseBranch,
        title: input.title,
        body: input.body,
      });

      return {
        repository,
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
