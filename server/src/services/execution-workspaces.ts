import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { executionWorkspaces } from "@atototo/db";
import { conflict } from "../errors.js";
import { resolveBatonInstanceRoot, resolveHomeAwarePath } from "../home-paths.js";

const execFile = promisify(execFileCb);
const EXPLICIT_BRANCH_RE = /\b((?:feature|bugfix|hotfix|chore|fix|refactor)\/[A-Za-z0-9._/-]+)\b/;
const JIRA_TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/i;
export const REPO_ONLY_CWD_SENTINEL = "/__baton_repo_only__";

export interface ExecutionWorkspacePlan {
  ownerIssueId: string | null;
  projectId: string | null;
  projectWorkspaceId: string;
  projectWorkspaceName: string;
  sourceRepoCwd: string;
  ticketKey: string;
  baseBranch: string | null;
  branch: string | null;
}

interface ExecutionWorkspacePlanIssueInput {
  id: string;
  projectId: string | null;
  billingCode: string | null;
  title: string;
  description: string | null;
  identifier: string | null;
}

interface ExecutionWorkspacePlanProjectWorkspaceInput {
  id: string;
  name: string;
  cwd: string | null;
  defaultBaseBranch?: string | null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugifyPathSegment(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 120) || "task";
}

function resolveManagedWorktreeRoot() {
  const configured = readNonEmptyString(process.env.BATON_WORKTREE_ROOT);
  if (configured) return resolveHomeAwarePath(configured);
  return path.resolve(resolveBatonInstanceRoot(), "worktrees");
}

async function runGit(cwd: string, args: string[]) {
  return execFile("git", args, { cwd });
}

async function resolveGitRoot(cwd: string) {
  const { stdout } = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const root = stdout.trim();
  if (!root) throw new Error(`Unable to resolve git root for "${cwd}"`);
  return root;
}

async function ensureCleanRepo(cwd: string) {
  // Only check tracked files (modified/deleted/staged). Untracked files are ignored
  // so that new files like AGENTS.md don't block worktree creation.
  const { stdout } = await runGit(cwd, ["status", "--porcelain", "-uno"]);
  if (stdout.trim().length > 0) {
    throw conflict(
      "Source repository has uncommitted changes to tracked files. Baton-managed worktrees require a clean source checkout.",
    );
  }
}

async function resolveCurrentBranch(cwd: string) {
  const { stdout } = await runGit(cwd, ["branch", "--show-current"]);
  return stdout.trim();
}

async function localBranchExists(cwd: string, branch: string) {
  try {
    await runGit(cwd, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveBaseRef(cwd: string, baseBranch: string) {
  try {
    await runGit(cwd, ["show-ref", "--verify", `refs/heads/${baseBranch}`]);
    return baseBranch;
  } catch {
    // continue
  }
  try {
    await runGit(cwd, ["show-ref", "--verify", `refs/remotes/origin/${baseBranch}`]);
    return `origin/${baseBranch}`;
  } catch {
    throw conflict(`Base branch "${baseBranch}" is not available in the source repository.`);
  }
}

export function normalizeExecutionTicketKey(value: unknown) {
  const trimmed = readNonEmptyString(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function extractJiraTicketKey(...sources: Array<string | null | undefined>) {
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(JIRA_TICKET_RE);
    if (match?.[1]) {
      return normalizeExecutionTicketKey(match[1]);
    }
  }
  return null;
}

export function deriveExecutionBranch(input: {
  ticketKey: string;
  explicitBranch?: string | null;
}) {
  const explicitBranch = readNonEmptyString(input.explicitBranch);
  if (explicitBranch) return explicitBranch;
  return `feature/${input.ticketKey}`;
}

export function extractExplicitBranch(...sources: Array<string | null | undefined>) {
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(EXPLICIT_BRANCH_RE);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function parseExecutionWorkspacePlan(
  payload: Record<string, unknown> | null | undefined,
): ExecutionWorkspacePlan | null {
  const rawWorkspace =
    payload && typeof payload.workspace === "object" && payload.workspace !== null
      ? (payload.workspace as Record<string, unknown>)
      : null;
  if (!rawWorkspace) return null;

  const ticketKey = normalizeExecutionTicketKey(rawWorkspace.ticketKey);
  const projectWorkspaceId = readNonEmptyString(rawWorkspace.projectWorkspaceId);
  const projectWorkspaceName = readNonEmptyString(rawWorkspace.projectWorkspaceName);
  const sourceRepoCwd = readNonEmptyString(rawWorkspace.sourceRepoCwd);
  if (!ticketKey || !projectWorkspaceId || !projectWorkspaceName || !sourceRepoCwd) {
    return null;
  }

  return {
    ownerIssueId: readNonEmptyString(rawWorkspace.ownerIssueId),
    projectId: readNonEmptyString(rawWorkspace.projectId),
    projectWorkspaceId,
    projectWorkspaceName,
    sourceRepoCwd,
    ticketKey,
    baseBranch: readNonEmptyString(rawWorkspace.baseBranch),
    branch: readNonEmptyString(rawWorkspace.branch),
  };
}

export function buildExecutionWorkspacePlanForIssue(input: {
  issue: ExecutionWorkspacePlanIssueInput;
  projectWorkspaces: ExecutionWorkspacePlanProjectWorkspaceInput[];
}) {
  const { issue, projectWorkspaces } = input;
  if (!issue.projectId) {
    throw conflict("Issue must belong to a project before requesting implementation approval.");
  }

  const ticketKey = normalizeExecutionTicketKey(
    extractJiraTicketKey(issue.billingCode, issue.title, issue.description, issue.identifier),
  );
  if (!ticketKey) {
    throw conflict("Implementation approval requires a Jira ticket key on the parent issue.");
  }

  const provisionableWorkspace =
    projectWorkspaces.find(
      (workspace) =>
        typeof workspace.cwd === "string" &&
        workspace.cwd.trim().length > 0 &&
        workspace.cwd !== REPO_ONLY_CWD_SENTINEL,
    ) ?? null;
  if (!provisionableWorkspace?.cwd) {
    throw conflict("Implementation approval requires a project workspace with a local source repository path.");
  }

  return {
    ownerIssueId: issue.id,
    projectId: issue.projectId,
    projectWorkspaceId: provisionableWorkspace.id,
    projectWorkspaceName: provisionableWorkspace.name,
    sourceRepoCwd: provisionableWorkspace.cwd,
    ticketKey,
    baseBranch: provisionableWorkspace.defaultBaseBranch ?? "main",
    branch: deriveExecutionBranch({
      ticketKey,
      explicitBranch: extractExplicitBranch(issue.description),
    }),
  } satisfies ExecutionWorkspacePlan;
}

export function executionWorkspaceService(db: Db) {
  return {
    getById: async (id: string) =>
      db
        .select()
        .from(executionWorkspaces)
        .where(eq(executionWorkspaces.id, id))
        .then((rows) => rows[0] ?? null),

    getByTicket: async (input: {
      companyId: string;
      projectWorkspaceId: string;
      ticketKey: string;
    }) =>
      db
        .select()
        .from(executionWorkspaces)
        .where(
          and(
            eq(executionWorkspaces.companyId, input.companyId),
            eq(executionWorkspaces.projectWorkspaceId, input.projectWorkspaceId),
            eq(executionWorkspaces.ticketKey, input.ticketKey),
          ),
        )
        .then((rows) => rows[0] ?? null),

    async provisionExecutionWorkspace(input: {
      companyId: string;
      plan: ExecutionWorkspacePlan;
      force?: boolean;
    }) {
      const sourceRepoCwd = await resolveGitRoot(input.plan.sourceRepoCwd);
      const ticketKey = normalizeExecutionTicketKey(input.plan.ticketKey);
      if (!ticketKey) {
        throw conflict("Execution workspace provisioning requires a Jira ticket key.");
      }

      const baseBranch = readNonEmptyString(input.plan.baseBranch) ?? "main";
      const branch = deriveExecutionBranch({
        ticketKey,
        explicitBranch: input.plan.branch,
      });

      if (!input.force) {
        await ensureCleanRepo(sourceRepoCwd);
      }
      const currentBranch = await resolveCurrentBranch(sourceRepoCwd);
      if (currentBranch && currentBranch !== baseBranch) {
        throw conflict(
          `Source repository must be on base branch "${baseBranch}" before provisioning a Baton worktree. Current branch: "${currentBranch}".`,
          {
            sourceRepoCwd,
            currentBranch,
            baseBranch,
          },
        );
      }

      const managedRoot = resolveManagedWorktreeRoot();
      const executionCwd = path.resolve(
        managedRoot,
        input.companyId,
        input.plan.projectWorkspaceId,
        slugifyPathSegment(ticketKey),
        "repo",
      );

      const existing = await db
        .select()
        .from(executionWorkspaces)
        .where(
          and(
            eq(executionWorkspaces.companyId, input.companyId),
            eq(executionWorkspaces.projectWorkspaceId, input.plan.projectWorkspaceId),
            eq(executionWorkspaces.ticketKey, ticketKey),
          ),
        )
        .then((rows) => rows[0] ?? null);

      const effectiveExecutionCwd = existing?.executionCwd ?? executionCwd;
      await fs.mkdir(path.dirname(effectiveExecutionCwd), { recursive: true });
      const executionExists = await fs
        .stat(effectiveExecutionCwd)
        .then((stats) => stats.isDirectory())
        .catch(() => false);

      if (!executionExists) {
        const branchExists = await localBranchExists(sourceRepoCwd, branch);
        if (branchExists) {
          await runGit(sourceRepoCwd, ["worktree", "add", effectiveExecutionCwd, branch]);
        } else {
          const baseRef = await resolveBaseRef(sourceRepoCwd, baseBranch);
          await runGit(sourceRepoCwd, ["worktree", "add", "-b", branch, effectiveExecutionCwd, baseRef]);
        }
      }

      const now = new Date();
      if (existing) {
        return db
          .update(executionWorkspaces)
          .set({
            ownerIssueId: input.plan.ownerIssueId,
            projectId: input.plan.projectId,
            sourceRepoCwd,
            executionCwd: effectiveExecutionCwd,
            branch,
            baseBranch,
            status: "ready",
            provisionedAt: now,
            updatedAt: now,
          })
          .where(eq(executionWorkspaces.id, existing.id))
          .returning()
          .then((rows) => rows[0]);
      }

      return db
        .insert(executionWorkspaces)
        .values({
          companyId: input.companyId,
          ownerIssueId: input.plan.ownerIssueId,
          projectId: input.plan.projectId,
          projectWorkspaceId: input.plan.projectWorkspaceId,
          sourceRepoCwd,
          executionCwd: effectiveExecutionCwd,
          ticketKey,
          branch,
          baseBranch,
          status: "ready",
          provisionedAt: now,
        })
        .returning()
        .then((rows) => rows[0]);
    },
  };
}
