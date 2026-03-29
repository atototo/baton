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

/** Parse delegations array from approval payload. */
export function parseDelegationPlan(
  payload: Record<string, unknown> | null | undefined,
): Array<{ agentName: string; projectWorkspaceId?: string; workspaceName?: string; tasks: string[] }> | null {
  if (!payload || !Array.isArray(payload.delegations)) return null;
  const entries: Array<{ agentName: string; projectWorkspaceId?: string; workspaceName?: string; tasks: string[] }> = [];
  for (const entry of payload.delegations) {
    if (!entry || typeof entry !== "object") continue;
    const agentName = readNonEmptyString((entry as Record<string, unknown>).agentName);
    if (!agentName) continue;
    const raw = entry as Record<string, unknown>;
    entries.push({
      agentName,
      projectWorkspaceId: readNonEmptyString(raw.projectWorkspaceId) ?? undefined,
      workspaceName: readNonEmptyString(raw.workspaceName) ?? undefined,
      tasks: Array.isArray(raw.tasks) ? raw.tasks.filter((t: unknown) => typeof t === "string") : [],
    });
  }
  return entries.length > 0 ? entries : null;
}

/**
 * Build workspace plans for each unique projectWorkspaceId found in delegations.
 * Returns a map: projectWorkspaceId → ExecutionWorkspacePlan
 */
export function buildExecutionWorkspacePlansForDelegations(input: {
  issue: ExecutionWorkspacePlanIssueInput;
  delegations: Array<{ agentName: string; projectWorkspaceId?: string; workspaceName?: string; tasks: string[] }>;
  projectWorkspaces: ExecutionWorkspacePlanProjectWorkspaceInput[];
}): Map<string, ExecutionWorkspacePlan> {
  const { issue, delegations, projectWorkspaces } = input;
  if (!issue.projectId) {
    throw conflict("Issue must belong to a project before requesting implementation approval.");
  }
  const ticketKey = normalizeExecutionTicketKey(
    extractJiraTicketKey(issue.billingCode, issue.title, issue.description, issue.identifier),
  );
  if (!ticketKey) {
    throw conflict("Implementation approval requires a Jira ticket key on the parent issue.");
  }

  const plans = new Map<string, ExecutionWorkspacePlan>();
  const workspaceById = new Map(projectWorkspaces.map((ws) => [ws.id, ws]));

  for (const delegation of delegations) {
    if (!delegation.projectWorkspaceId) continue;
    if (plans.has(delegation.projectWorkspaceId)) continue;

    const ws = workspaceById.get(delegation.projectWorkspaceId);
    if (!ws?.cwd || ws.cwd === REPO_ONLY_CWD_SENTINEL) continue;

    plans.set(delegation.projectWorkspaceId, {
      ownerIssueId: issue.id,
      projectId: issue.projectId,
      projectWorkspaceId: ws.id,
      projectWorkspaceName: ws.name,
      sourceRepoCwd: ws.cwd,
      ticketKey,
      baseBranch: ws.defaultBaseBranch ?? "main",
      branch: deriveExecutionBranch({
        ticketKey,
        explicitBranch: extractExplicitBranch(issue.description),
      }),
    });
  }

  return plans;
}

/**
 * Infer the best workspace for an issue by matching issue content against
 * workspace names/paths.  Returns the matched workspace or null.
 *
 * Heuristics (checked against title + description, case-insensitive):
 *   - Explicit tags: "[FE]", "[BE]", "[Frontend]", "[Backend]", "[Ops]"
 *   - Domain keywords mapped to common repo name suffixes (_fe, _be, _ops, etc.)
 */
function inferWorkspaceFromIssue(
  issue: ExecutionWorkspacePlanIssueInput,
  workspaces: ExecutionWorkspacePlanProjectWorkspaceInput[],
): ExecutionWorkspacePlanProjectWorkspaceInput | null {
  if (workspaces.length <= 1) return null;

  const text = `${issue.title}\n${issue.description ?? ""}`.toLowerCase();

  // Explicit tag patterns → workspace path/name substring
  const tagRules: Array<{ patterns: RegExp[]; wsKeywords: string[] }> = [
    {
      patterns: [/\[fe\]/, /\[frontend\]/, /\[front[ -]?end\]/],
      wsKeywords: ["_fe", "-fe", "frontend", "front-end"],
    },
    {
      patterns: [/\[be\]/, /\[backend\]/, /\[back[ -]?end\]/],
      wsKeywords: ["_be", "-be", "backend", "back-end"],
    },
    {
      patterns: [/\[ops\]/, /\[infra\]/, /\[devops\]/],
      wsKeywords: ["_ops", "-ops", "infra", "devops"],
    },
  ];

  for (const rule of tagRules) {
    if (rule.patterns.some((p) => p.test(text))) {
      const match = workspaces.find((ws) => {
        const id = `${ws.name}\n${ws.cwd ?? ""}`.toLowerCase();
        return rule.wsKeywords.some((kw) => id.includes(kw));
      });
      if (match) return match;
    }
  }

  // Keyword-based inference (no explicit tag)
  const feKeywords =
    /\b(ui|ux|컴포넌트|component|페이지|page|프론트|front|vue|react|nuxt|next|css|scss|레이아웃|layout|탭|tab|버튼|button|모달|modal|폼|form)\b/;
  const beKeywords =
    /\b(api|서버|server|엔드포인트|endpoint|컨트롤러|controller|서비스|service|리포지토리|repository|db|database|마이그레이션|migration|스프링|spring|webflux)\b/;

  const feScore = (text.match(feKeywords) ?? []).length;
  const beScore = (text.match(beKeywords) ?? []).length;

  if (feScore > 0 && feScore > beScore) {
    const match = workspaces.find((ws) => {
      const id = `${ws.name}\n${ws.cwd ?? ""}`.toLowerCase();
      return ["_fe", "-fe", "frontend", "front-end"].some((kw) => id.includes(kw));
    });
    if (match) return match;
  }

  if (beScore > 0 && beScore > feScore) {
    const match = workspaces.find((ws) => {
      const id = `${ws.name}\n${ws.cwd ?? ""}`.toLowerCase();
      return ["_be", "-be", "backend", "back-end"].some((kw) => id.includes(kw));
    });
    if (match) return match;
  }

  return null;
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

  const provisionable = projectWorkspaces.filter(
    (workspace) =>
      typeof workspace.cwd === "string" &&
      workspace.cwd.trim().length > 0 &&
      workspace.cwd !== REPO_ONLY_CWD_SENTINEL,
  );
  // Infer best workspace from issue content; fall back to first provisionable
  const provisionableWorkspace = inferWorkspaceFromIssue(issue, provisionable) ?? provisionable[0] ?? null;
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

    listPullRequestOpenWorkspaces: async () =>
      db
        .select()
        .from(executionWorkspaces)
        .where(eq(executionWorkspaces.syncStatus, "pr_open")),

    updateSyncState: async (
      id: string,
      patch: {
        syncStatus?: string;
        syncMethod?: string;
        lastSyncedAt?: Date | null;
        lastVerifiedAt?: Date | null;
        lastPrCheckedAt?: Date | null;
        lastBaseCommitSha?: string | null;
        lastBranchCommitSha?: string | null;
        pullRequestUrl?: string | null;
        pullRequestNumber?: string | null;
        prOpenedAt?: Date | null;
        lastDriftDetectedAt?: Date | null;
        conflictSummary?: Record<string, unknown> | null;
        escalationSummary?: string | null;
        recoveryStatus?: string;
        recoveryReason?: string | null;
        recoveryRequestedAt?: Date | null;
        recoveryStartedAt?: Date | null;
        recoveryFinishedAt?: Date | null;
        recoveryAttemptCount?: number;
        lastRecoveryRunId?: string | null;
        recoveryContext?: Record<string, unknown> | null;
      },
    ) =>
      db
        .update(executionWorkspaces)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(executionWorkspaces.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    updateRecoveryState: async (
      id: string,
      patch: {
        recoveryStatus?: string;
        recoveryReason?: string | null;
        recoveryRequestedAt?: Date | null;
        recoveryStartedAt?: Date | null;
        recoveryFinishedAt?: Date | null;
        recoveryAttemptCount?: number;
        lastRecoveryRunId?: string | null;
        recoveryContext?: Record<string, unknown> | null;
        escalationSummary?: string | null;
      },
    ) =>
      db
        .update(executionWorkspaces)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(executionWorkspaces.id, id))
        .returning()
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
