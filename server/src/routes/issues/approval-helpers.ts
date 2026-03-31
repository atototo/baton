/**
 * Issue approval orchestration helpers.
 *
 * Extracted from issue-routes.ts to reduce file size and improve maintainability.
 * All functions receive services through the IssueApprovalContext instead of closures.
 */
import { issues as issueTable, type Db } from "@atototo/db";
import { sql } from "drizzle-orm";
import { conflict } from "../../errors.js";
import {
  approvalService as approvalServiceFactory,
  issueApprovalService as issueApprovalServiceFactory,
  type approvalService,
  type issueApprovalService,
  type issueService,
  type projectService,
  type executionWorkspaceService,
  buildExecutionWorkspacePlanForIssue,
  buildExecutionWorkspacePlansForDelegations,
  issueWorkflowOrchestrator,
  logActivity,
} from "../../services/index.js";
import type { getActorInfo } from "../authz.js";

// ---- Shared types ----

export type IssueRow = NonNullable<Awaited<ReturnType<ReturnType<typeof issueService>["getById"]>>>;
export type ActorInfo = ReturnType<typeof getActorInfo>;
export type ApprovalType =
  | "approve_issue_plan"
  | "approve_pull_request"
  | "approve_push_to_existing_pr"
  | "approve_completion";
export type DelegationSpec = { agentName: string; projectWorkspaceId?: string; workspaceName?: string; tasks: string[] };
type ApprovalRow = Awaited<ReturnType<ReturnType<typeof approvalService>["create"]>>;

/** Services required by approval helpers — passed in from the route closure. */
export type IssueApprovalContext = {
  db: Db;
  svc: ReturnType<typeof issueService>;
  approvalsSvc: ReturnType<typeof approvalService>;
  issueApprovalsSvc: ReturnType<typeof issueApprovalService>;
  projectsSvc: ReturnType<typeof projectService>;
  executionWorkspacesSvc: ReturnType<typeof executionWorkspaceService>;
};

const BOARD_REVIEW_APPROVAL_TYPES = [
  "approve_pull_request",
  "approve_push_to_existing_pr",
  "approve_completion",
] as const;

function isStaleApprovedExistingPrApproval(
  approval: Awaited<ReturnType<typeof issueApprovalServiceFactory>> extends { listApprovalsForIssue: (...args: any[]) => Promise<infer T> }
    ? T extends Array<infer U>
      ? U
      : never
    : never,
) {
  if (approval.type !== "approve_push_to_existing_pr" || approval.status !== "approved") return false;
  const commitCreated = approval.payload?.commitCreated;
  const commitSha = typeof approval.payload?.commitSha === "string" ? approval.payload.commitSha.trim() : "";
  return commitCreated === undefined && commitSha.length === 0;
}

// ---- Pure helpers (no service deps) ----

export function extractBranchName(...sources: Array<string | null | undefined>) {
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(/\b(?:feature|bugfix|hotfix|chore|fix|refactor)\/[A-Za-z0-9._/-]+\b/);
    if (match) return match[0];
  }
  return null;
}

export function extractPlanText(description: string | null | undefined) {
  if (!description) return null;
  const match = description.match(/<plan>([\s\S]*?)<\/plan>/);
  return match?.[1]?.trim() ?? null;
}

function looksLikePlanSubmissionIntent(...sources: Array<string | null | undefined>) {
  const combined = sources
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
  if (combined.length === 0) return false;

  return [
    "<plan>",
    "계획 제출",
    "plan submission",
    "plan approval",
    "approve_issue_plan",
    "child issue",
    "subtask",
    "delegation",
    "구현 이슈",
    "하위 구현 이슈",
    "하위 이슈",
  ].some((needle) => combined.includes(needle));
}

export function isAgentReviewHandoff(args: { issue: IssueRow; existing: IssueRow; actor: ActorInfo }): boolean {
  const { issue, existing, actor } = args;
  if (actor.actorType !== "agent" || !actor.agentId) return false;
  if (issue.status !== "in_review") return false;
  if (!issue.assigneeUserId) return false;
  if (existing.createdByUserId && issue.assigneeUserId !== existing.createdByUserId) return false;
  return true;
}

export function determineApprovalType(args: {
  planText: string | null;
  hasApprovedPlan: boolean;
  hasExecutionWorkspace: boolean;
  hasOpenPullRequest: boolean;
}): ApprovalType {
  if (args.planText && !args.hasApprovedPlan) return "approve_issue_plan";
  if (args.hasOpenPullRequest) return "approve_push_to_existing_pr";
  if (args.hasExecutionWorkspace) return "approve_pull_request";
  return "approve_completion";
}

export function buildApprovalPayload(args: {
  type: ApprovalType;
  issue: IssueRow;
  planText: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workspacePlan?: any;
  resolvedDelegations?: DelegationSpec[];
  branchName: string | null;
  baseBranch: string | null;
  commentBody?: string;
}): Record<string, unknown> {
  const { type, issue, planText, workspacePlan, resolvedDelegations, branchName, baseBranch, commentBody } = args;
  const base = { title: issue.title, issueIdentifier: issue.identifier };
  switch (type) {
    case "approve_issue_plan":
      return {
        ...base,
        plan: planText,
        workspace: workspacePlan ?? null,
        ...(resolvedDelegations ? { delegations: resolvedDelegations } : {}),
        summary: commentBody ?? "Requesting board approval for the proposed implementation plan.",
      };
    case "approve_completion":
      return { ...base, summary: commentBody ?? "분석/리서치 작업 완료. 보드 승인 요청합니다." };
    case "approve_pull_request":
      return {
        ...base,
        branch: branchName,
        baseBranch,
        summary: commentBody ?? "Requesting board approval before opening a pull request.",
      };
    case "approve_push_to_existing_pr":
      return {
        ...base,
        branch: branchName,
        baseBranch,
        summary: commentBody ?? "Requesting board approval before pushing updates to the existing pull request.",
      };
  }
}

export async function findOrCreateLinkedApproval(args: {
  db: Db;
  issue: IssueRow;
  type: ApprovalType;
  agentId: string;
  actor: ActorInfo;
  payload: Record<string, unknown>;
  source: string;
}): Promise<{ approval: ApprovalRow; created: boolean }> {
  const { db, issue, type, agentId, actor, payload, source } = args;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select ${issueTable.id} from ${issueTable} where ${issueTable.id} = ${issue.id} for update`);

    const txDb = tx as unknown as Db;
    const txApprovalsSvc = approvalServiceFactory(txDb);
    const txIssueApprovalsSvc = issueApprovalServiceFactory(txDb);

    const linkedApprovals = await txIssueApprovalsSvc.listApprovalsForIssue(issue.id);
    const linkedExisting = linkedApprovals.find(
      (approval) =>
        approval.type === type && (approval.status === "pending" || approval.status === "revision_requested"),
    );
    const existing =
      linkedExisting ??
      (await txApprovalsSvc.findActionableForIssue({
        companyId: issue.companyId,
        type,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
      }));

    if (existing) {
      await txIssueApprovalsSvc.link(issue.id, existing.id, { agentId, userId: null });
      return { approval: existing, created: false };
    }

    const approval = await txApprovalsSvc.create(issue.companyId, {
      type,
      requestedByAgentId: actor.agentId,
      requestedByUserId: null,
      payload,
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    await txIssueApprovalsSvc.link(issue.id, approval.id, { agentId: actor.agentId, userId: null });

    await logActivity(txDb, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type, issueIds: [issue.id], source },
    });
    await logActivity(txDb, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.approval_linked",
      entityType: "issue",
      entityId: issue.id,
      details: { approvalId: approval.id, source },
    });

    return { approval, created: true };
  });
}

// ---- Factory: creates helpers bound to services ----

export function createIssueApprovalHelpers(ctx: IssueApprovalContext) {
  const { db, svc, approvalsSvc, issueApprovalsSvc, projectsSvc, executionWorkspacesSvc } = ctx;
  const workflowOrchestrator = issueWorkflowOrchestrator(db);

  async function buildExecutionWorkspacePlan(issue: IssueRow) {
    if (!issue.projectId) {
      throw conflict("Issue must belong to a project before requesting implementation approval.");
    }
    const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId);
    return buildExecutionWorkspacePlanForIssue({ issue, projectWorkspaces });
  }

  async function maybeBlockIssueForPendingPlanApproval(args: {
    issue: IssueRow;
    actor: ActorInfo;
    approvalId: string;
    source: string;
  }) {
    const { issue, actor, approvalId, source } = args;
    if (issue.status !== "todo" && issue.status !== "in_progress") return;

    const blockedIssue = await svc.update(issue.id, { status: "blocked" });
    if (!blockedIssue) return;

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.blocked_for_approval",
      entityType: "issue",
      entityId: issue.id,
      details: {
        approvalId,
        approvalType: "approve_issue_plan",
        previousStatus: issue.status,
        nextStatus: blockedIssue.status,
        source,
      },
    });
  }

  async function resolveIssueBranchName(
    issue: IssueRow,
    ...fallbackSources: Array<string | null | undefined>
  ) {
    if (issue.executionWorkspaceId) {
      const executionWorkspace = await executionWorkspacesSvc.getById(issue.executionWorkspaceId);
      if (typeof executionWorkspace?.branch === "string" && executionWorkspace.branch.trim().length > 0) {
        return executionWorkspace.branch;
      }
    }
    return extractBranchName(...fallbackSources);
  }

  async function resolveIssueBaseBranch(issue: IssueRow, fallback = "main") {
    if (issue.executionWorkspaceId) {
      const executionWorkspace = await executionWorkspacesSvc.getById(issue.executionWorkspaceId);
      if (typeof executionWorkspace?.baseBranch === "string" && executionWorkspace.baseBranch.trim().length > 0) {
        return executionWorkspace.baseBranch;
      }
    }
    if (issue.projectId) {
      const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId);
      const primaryWorkspace =
        projectWorkspaces.find((workspace) => workspace.isPrimary) ?? projectWorkspaces[0] ?? null;
      if (
        primaryWorkspace &&
        typeof primaryWorkspace.defaultBaseBranch === "string" &&
        primaryWorkspace.defaultBaseBranch.trim().length > 0
      ) {
        return primaryWorkspace.defaultBaseBranch;
      }
    }
    return fallback;
  }

  async function resolveWorkspacePlanForDelegations(args: {
    issue: IssueRow;
    delegations?: DelegationSpec[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<{ workspacePlan: any; resolvedDelegations?: DelegationSpec[] }> {
    const { issue, delegations } = args;

    if (issue.projectId) {
      const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId);
      if (projectWorkspaces.length > 1) {
        if (!delegations || delegations.length === 0 || !delegations.some((d) => d.projectWorkspaceId)) {
          // Multi-workspace project without explicit delegations — fall back to
          // the primary workspace so the approval is still created.  The board
          // can reject/revise if the workspace mapping is wrong.
          return { workspacePlan: await buildExecutionWorkspacePlan(issue) };
        }
        const plans = buildExecutionWorkspacePlansForDelegations({ issue, delegations, projectWorkspaces });
        const firstPlan = plans.values().next().value;
        return {
          workspacePlan: firstPlan ?? (await buildExecutionWorkspacePlan(issue)),
          resolvedDelegations: delegations,
        };
      }
      return { workspacePlan: await buildExecutionWorkspacePlan(issue) };
    }

    if (delegations && delegations.length > 0 && delegations.some((d) => d.projectWorkspaceId)) {
      const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId!);
      const plans = buildExecutionWorkspacePlansForDelegations({ issue, delegations, projectWorkspaces });
      const firstPlan = plans.values().next().value;
      return {
        workspacePlan: firstPlan ?? (await buildExecutionWorkspacePlan(issue)),
        resolvedDelegations: delegations,
      };
    }

    return { workspacePlan: await buildExecutionWorkspacePlan(issue) };
  }

  // ---- Main orchestrators ----

  async function unlinkObsoleteBoardReviewApprovals(args: {
    issue: IssueRow;
    actor: ActorInfo;
    nextApprovalType: ApprovalType;
    linkedApprovals: Awaited<ReturnType<typeof issueApprovalsSvc.listApprovalsForIssue>>;
    source: string;
  }) {
    const { issue, actor, nextApprovalType, linkedApprovals, source } = args;
    if (
      nextApprovalType !== "approve_pull_request" &&
      nextApprovalType !== "approve_push_to_existing_pr" &&
      nextApprovalType !== "approve_completion"
    ) {
      return;
    }

    const obsoleteApprovals = linkedApprovals.filter(
      (approval) =>
        ((approval.status === "revision_requested" &&
          BOARD_REVIEW_APPROVAL_TYPES.includes(approval.type as (typeof BOARD_REVIEW_APPROVAL_TYPES)[number]) &&
          approval.type !== nextApprovalType) ||
          (nextApprovalType === "approve_push_to_existing_pr" && isStaleApprovedExistingPrApproval(approval))),
    );

    for (const approval of obsoleteApprovals) {
      await issueApprovalsSvc.unlink(issue.id, approval.id);
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.approval_unlinked",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: approval.id,
          approvalType: approval.type,
          nextApprovalType,
          source,
          reason:
            approval.type === "approve_push_to_existing_pr" && approval.status === "approved"
              ? "stale_existing_pr_update_approval"
              : "obsolete_board_review_approval",
        },
      });
    }
  }

  async function maybeCreateBoardReviewApproval(args: {
    issue: IssueRow;
    existing: IssueRow;
    actor: ActorInfo;
    commentBody?: string;
    isAgentReturningIssueToCreator: boolean;
    delegations?: DelegationSpec[];
  }) {
    let { issue } = args;
    const { existing, actor, commentBody, isAgentReturningIssueToCreator, delegations } = args;
    if (!isAgentReturningIssueToCreator) return;
    if (!isAgentReviewHandoff({ issue, existing, actor })) return;

    const planText = extractPlanText(issue.description);
    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(issue.id);
    const hasApprovedPlan = linkedApprovals.some(
      (a) => a.type === "approve_issue_plan" && a.status === "approved",
    );
    const executionWorkspace = issue.executionWorkspaceId
      ? await executionWorkspacesSvc.getById(issue.executionWorkspaceId)
      : null;

    const approvalType = determineApprovalType({
      planText,
      hasApprovedPlan,
      hasExecutionWorkspace: !!issue.executionWorkspaceId,
      hasOpenPullRequest: Boolean(
        executionWorkspace?.pullRequestUrl || executionWorkspace?.pullRequestNumber || executionWorkspace?.prOpenedAt,
      ),
    });

    if (
      approvalType === "approve_completion" &&
      !planText &&
      !hasApprovedPlan &&
      looksLikePlanSubmissionIntent(commentBody, issue.description)
    ) {
      throw conflict(
        "Planning handoff is missing a <plan>...</plan> block in the issue description. Update the description first instead of falling back to completion approval.",
        {
          issueId: issue.id,
          source: "issue.review_handoff",
          reason: "missing_plan_block_for_planning_handoff",
        },
      );
    }

    await unlinkObsoleteBoardReviewApprovals({
      issue,
      actor,
      nextApprovalType: approvalType,
      linkedApprovals,
      source: "issue.review_handoff",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let workspacePlan: any = null;
    let resolvedDelegations: DelegationSpec[] | undefined;
    if (approvalType === "approve_issue_plan") {
      const resolved = await resolveWorkspacePlanForDelegations({ issue, delegations });
      workspacePlan = resolved.workspacePlan;
      resolvedDelegations = resolved.resolvedDelegations;
    }

    const branchName =
      approvalType === "approve_pull_request" || approvalType === "approve_push_to_existing_pr"
        ? await resolveIssueBranchName(issue, commentBody, issue.description)
        : workspacePlan?.branch ?? extractBranchName(commentBody, issue.description);
    const baseBranch = approvalType !== "approve_completion" ? await resolveIssueBaseBranch(issue) : null;
    const workflowKind = workflowOrchestrator.approvalTypeToWorkflowKind(approvalType);
    if (workflowKind) {
      const handoffState = await workflowOrchestrator.beginApprovalHandoff({
        companyId: issue.companyId,
        issueId: issue.id,
        currentWorkflowEpoch: existing.workflowEpoch ?? issue.workflowEpoch ?? 0,
        kind: workflowKind,
        executionWorkspaceId: issue.executionWorkspaceId ?? null,
        branch: branchName,
        baseBranch,
        source: "issue.review_handoff",
      });
      issue = {
        ...issue,
        workflowEpoch: handoffState.issueWorkflowEpoch,
        workflowUpdatedAt: new Date(),
        updatedAt: new Date(),
      } as IssueRow;
    }

    const payload = buildApprovalPayload({
      type: approvalType, issue, planText, workspacePlan, resolvedDelegations, branchName, baseBranch, commentBody,
    });

    const { approval, created } = await findOrCreateLinkedApproval({
      db,
      issue,
      type: approvalType,
      agentId: actor.agentId!,
      actor,
      payload,
      source: "issue.review_handoff",
    });

    await workflowOrchestrator.attachApprovalWorkflowSession({
      companyId: issue.companyId,
      issue: {
        id: issue.id,
        workflowEpoch: issue.workflowEpoch ?? 0,
        executionWorkspaceId: issue.executionWorkspaceId ?? null,
      },
      approval: {
        id: approval.id,
        type: approval.type,
        requestedByAgentId: actor.agentId ?? null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        payload: {
          branch: branchName,
          baseBranch,
        },
      },
      requestRunId: actor.runId ?? null,
      source: "issue.review_handoff",
      context: {
        created,
      },
    });

    if (approvalType === "approve_issue_plan" && created) {
      await maybeBlockIssueForPendingPlanApproval({ issue, actor, approvalId: approval.id, source: "issue.review_handoff" });
    }
  }

  async function maybeCreateParentPlanApprovalForDelegation(args: {
    parentIssueId: string;
    actor: ActorInfo;
    summary?: string;
    source: "subtask_create" | "assignee_change";
  }) {
    const { parentIssueId, actor, summary, source } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;

    const parentIssue = await svc.getById(parentIssueId);
    if (!parentIssue) return;

    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(parentIssue.id);
    if (linkedApprovals.some((a) => a.type === "approve_issue_plan" && a.status === "approved")) return;

    const planText = extractPlanText(parentIssue.description);
    if (!planText) {
      throw conflict("Parent issue must include a <plan>...</plan> block before requesting issue plan approval.", {
        parentIssueId,
        source,
        reason: "missing_plan",
      });
    }

    const workspacePlan = await buildExecutionWorkspacePlan(parentIssue);

    const { approval, created } = await findOrCreateLinkedApproval({
      db,
      issue: parentIssue,
      type: "approve_issue_plan",
      agentId: actor.agentId,
      actor,
      payload: {
        title: parentIssue.title,
        issueIdentifier: parentIssue.identifier,
        plan: planText,
        description: parentIssue.description,
        branch: workspacePlan?.branch ?? extractBranchName(parentIssue.description),
        workspace: workspacePlan,
        summary: summary ?? "Requesting board approval for the implementation plan and delegated subtasks before execution starts.",
      },
      source,
    });

    if (created) {
      await maybeBlockIssueForPendingPlanApproval({
        issue: parentIssue,
        actor,
        approvalId: approval.id,
        source,
      });
    }
  }

  async function assertParentPlanApprovedBeforeDelegation(args: {
    parentIssueId: string;
    actor: ActorInfo;
    source: "subtask_create" | "assignee_change";
  }) {
    const { parentIssueId, actor, source } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;

    const parentIssue = await svc.getById(parentIssueId);
    if (!parentIssue) return;

    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(parentIssue.id);
    const approvedPlanApprovals = linkedApprovals.filter(
      (approval) => approval.type === "approve_issue_plan" && approval.status === "approved",
    );

    if (approvedPlanApprovals.length > 0) {
      if (parentIssue.executionWorkspaceId) return;

      const hasPendingWorkspacePlan = linkedApprovals.some(
        (approval) =>
          approval.type === "approve_issue_plan" &&
          (approval.status === "pending" || approval.status === "revision_requested") &&
          approval.payload?.executionWorkspace,
      );
      if (hasPendingWorkspacePlan) {
        throw conflict(
          "Implementation requires workspace approval. A plan with workspace is pending — wait for board approval.",
          { parentIssueId, source },
        );
      }

      throw conflict(
        "Implementation requires an execution workspace. Submit a new approve_issue_plan with workspace details.",
        { parentIssueId, source, reason: "no_execution_workspace" },
      );
    }

    await maybeCreateParentPlanApprovalForDelegation({ parentIssueId, actor, source });

    const messageBySource = {
      subtask_create: "Parent issue plan approval is required before creating subtasks",
      assignee_change: "Parent issue plan approval is required before assigning delegated subtasks",
    } as const;

    throw conflict(messageBySource[source], { parentIssueId, source });
  }

  return {
    maybeBlockIssueForPendingPlanApproval,
    resolveIssueBranchName,
    resolveIssueBaseBranch,
    resolveWorkspacePlanForDelegations,
    maybeCreateBoardReviewApproval,
    maybeCreateParentPlanApprovalForDelegation,
    assertParentPlanApprovedBeforeDelegation,
  };
}
