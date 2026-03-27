/**
 * Issue approval orchestration helpers.
 *
 * Extracted from issue-routes.ts to reduce file size and improve maintainability.
 * All functions receive services through the IssueApprovalContext instead of closures.
 */
import { issues as issueTable, type Db } from "@atototo/db";
import { conflict } from "../../errors.js";
import {
  type approvalService,
  type issueApprovalService,
  type issueService,
  type projectService,
  type executionWorkspaceService,
  buildExecutionWorkspacePlanForIssue,
  buildExecutionWorkspacePlansForDelegations,
  logActivity,
} from "../../services/index.js";
import type { getActorInfo } from "../authz.js";

// ---- Shared types ----

export type IssueRow = NonNullable<Awaited<ReturnType<ReturnType<typeof issueService>["getById"]>>>;
export type ActorInfo = ReturnType<typeof getActorInfo>;
export type ApprovalType = "approve_issue_plan" | "approve_pull_request" | "approve_completion";
export type DelegationSpec = { agentName: string; projectWorkspaceId?: string; workspaceName?: string; tasks: string[] };

/** Services required by approval helpers — passed in from the route closure. */
export type IssueApprovalContext = {
  db: Db;
  svc: ReturnType<typeof issueService>;
  approvalsSvc: ReturnType<typeof approvalService>;
  issueApprovalsSvc: ReturnType<typeof issueApprovalService>;
  projectsSvc: ReturnType<typeof projectService>;
  executionWorkspacesSvc: ReturnType<typeof executionWorkspaceService>;
};

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
}): ApprovalType {
  if (args.planText && !args.hasApprovedPlan) return "approve_issue_plan";
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
  }
}

// ---- Factory: creates helpers bound to services ----

export function createIssueApprovalHelpers(ctx: IssueApprovalContext) {
  const { db, svc, approvalsSvc, issueApprovalsSvc, projectsSvc, executionWorkspacesSvc } = ctx;

  async function buildExecutionWorkspacePlan(issue: IssueRow) {
    if (!issue.projectId) {
      throw conflict("Issue must belong to a project before requesting implementation approval.");
    }
    const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId);
    return buildExecutionWorkspacePlanForIssue({ issue, projectWorkspaces });
  }

  async function reuseOrLinkExistingApproval(args: {
    issue: IssueRow;
    type: ApprovalType;
    agentId: string;
  }): Promise<boolean> {
    const { issue, type, agentId } = args;
    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(issue.id);
    const linkedExisting = linkedApprovals.find(
      (approval) =>
        approval.type === type && (approval.status === "pending" || approval.status === "revision_requested"),
    );
    const existing =
      linkedExisting ??
      (await approvalsSvc.findActionableForIssue({
        companyId: issue.companyId,
        type,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
      }));
    if (!existing) return false;
    await issueApprovalsSvc.link(issue.id, existing.id, { agentId, userId: null });
    return true;
  }

  async function createAndLinkApproval(args: {
    issue: IssueRow;
    actor: ActorInfo;
    type: ApprovalType;
    payload: Record<string, unknown>;
    source: string;
  }) {
    const { issue, actor, type, payload, source } = args;
    const approval = await approvalsSvc.create(issue.companyId, {
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

    await issueApprovalsSvc.link(issue.id, approval.id, { agentId: actor.agentId, userId: null });

    await logActivity(db, {
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
    await logActivity(db, {
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

    return approval;
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

  async function maybeCreateBoardReviewApproval(args: {
    issue: IssueRow;
    existing: IssueRow;
    actor: ActorInfo;
    commentBody?: string;
    isAgentReturningIssueToCreator: boolean;
    delegations?: DelegationSpec[];
  }) {
    const { issue, existing, actor, commentBody, isAgentReturningIssueToCreator, delegations } = args;
    if (!isAgentReturningIssueToCreator) return;
    if (!isAgentReviewHandoff({ issue, existing, actor })) return;

    const planText = extractPlanText(issue.description);
    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(issue.id);
    const hasApprovedPlan = linkedApprovals.some(
      (a) => a.type === "approve_issue_plan" && a.status === "approved",
    );

    const approvalType = determineApprovalType({
      planText,
      hasApprovedPlan,
      hasExecutionWorkspace: !!issue.executionWorkspaceId,
    });

    if (await reuseOrLinkExistingApproval({ issue, type: approvalType, agentId: actor.agentId! })) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let workspacePlan: any = null;
    let resolvedDelegations: DelegationSpec[] | undefined;
    if (approvalType === "approve_issue_plan") {
      const resolved = await resolveWorkspacePlanForDelegations({ issue, delegations });
      workspacePlan = resolved.workspacePlan;
      resolvedDelegations = resolved.resolvedDelegations;
    }

    const branchName =
      approvalType === "approve_pull_request"
        ? await resolveIssueBranchName(issue, commentBody, issue.description)
        : workspacePlan?.branch ?? extractBranchName(commentBody, issue.description);
    const baseBranch = approvalType !== "approve_completion" ? await resolveIssueBaseBranch(issue) : null;

    const payload = buildApprovalPayload({
      type: approvalType, issue, planText, workspacePlan, resolvedDelegations, branchName, baseBranch, commentBody,
    });

    const approval = await createAndLinkApproval({ issue, actor, type: approvalType, payload, source: "issue.review_handoff" });

    if (approvalType === "approve_issue_plan") {
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
    if (await reuseOrLinkExistingApproval({ issue: parentIssue, type: "approve_issue_plan", agentId: actor.agentId })) return;

    const planText = extractPlanText(parentIssue.description);
    const workspacePlan = await buildExecutionWorkspacePlan(parentIssue);

    const approval = await createAndLinkApproval({
      issue: parentIssue,
      actor,
      type: "approve_issue_plan",
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

    await maybeBlockIssueForPendingPlanApproval({
      issue: parentIssue,
      actor,
      approvalId: approval.id,
      source,
    });
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
    reuseOrLinkExistingApproval,
    createAndLinkApproval,
    maybeBlockIssueForPendingPlanApproval,
    resolveIssueBranchName,
    resolveIssueBaseBranch,
    resolveWorkspacePlanForDelegations,
    maybeCreateBoardReviewApproval,
    maybeCreateParentPlanApprovalForDelegation,
    assertParentPlanApprovedBeforeDelegation,
  };
}
