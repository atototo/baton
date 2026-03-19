import { Router, type Request, type Response } from "express";
import multer from "multer";
import { issues as issueTable, type Db } from "@atototo/db";
import { and, eq } from "drizzle-orm";
import {
  addIssueCommentSchema,
  createIssueAttachmentMetadataSchema,
  createIssueLabelSchema,
  checkoutIssueSchema,
  createIssueSchema,
  linkIssueApprovalSchema,
  updateIssueSchema,
} from "@atototo/shared";
import type { StorageService } from "../storage/types.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  agentService,
  approvalService,
  buildExecutionWorkspacePlanForIssue,
  executionWorkspaceService,
  goalService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  projectService,
} from "../services/index.js";
import { logger } from "../middleware/logger.js";
import { conflict, forbidden, HttpError, unauthorized } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { sanitizeProjectWorkspacePaths } from "./issue-response.js";
import {
  isAssigneeAgentReviewCompletionAttempt,
  isAssigneeAgentDoneAttempt,
  isAssigneeAgentReviewRequestAttempt,
  rewriteChildAgentDoneToReview,
  rewriteParentAgentDoneToReview,
  TERMINAL_ISSUE_STATUSES,
} from "./issue-workflow.js";

const MAX_ATTACHMENT_BYTES = Number(process.env.BATON_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
export function issueRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = issueService(db);
  const access = accessService(db);
  const heartbeat = heartbeatService(db);
  const executionWorkspacesSvc = executionWorkspaceService(db);
  const agentsSvc = agentService(db);
  const approvalsSvc = approvalService(db);
  const projectsSvc = projectService(db);
  const goalsSvc = goalService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  function withContentPath<T extends { id: string }>(attachment: T) {
    return {
      ...attachment,
      contentPath: `/api/attachments/${attachment.id}/content`,
    };
  }

  async function runSingleFileUpload(req: Request, res: Response) {
    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function assertCanManageIssueApprovalLinks(req: Request, res: Response, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") return true;
    if (!req.actor.agentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    const actorAgent = await agentsSvc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    if (actorAgent.role === "ceo" || Boolean(actorAgent.permissions?.canCreateAgents)) return true;
    res.status(403).json({ error: "Missing permission to link approvals" });
    return false;
  }

  function canCreateAgentsLegacy(agent: { permissions: Record<string, unknown> | null | undefined; role: string }) {
    if (agent.role === "ceo") return true;
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  function normalizeDelegatedChildTitle(title: string | null | undefined) {
    let normalized = (title ?? "").trim();
    normalized = normalized.replace(/^\[[^\]]+\]\s*/, "").trim();
    while (/\s*\([^)]*\)\s*$/.test(normalized)) {
      normalized = normalized.replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
    return normalized.toLowerCase();
  }

  function normalizeDelegationValue(value: string | null | undefined) {
    return (value ?? "").trim().toLowerCase();
  }

  function normalizeIssueDelegation(
    delegation:
      | {
          kind?: string | null;
          key?: string | null;
          targetPath?: string | null;
          scope?: string | null;
        }
      | null
      | undefined,
  ) {
    if (!delegation) return null;
    const kind = normalizeDelegationValue(delegation.kind);
    const key = normalizeDelegationValue(delegation.key);
    if (!kind || !key) return null;
    return {
      kind,
      key,
      targetPath: delegation.targetPath?.trim() || null,
      scope: delegation.scope?.trim() || null,
    };
  }

  async function findReusableActiveChildIssue(args: {
    companyId: string;
    parentId: string;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
    title: string;
    delegation?:
      | {
          kind?: string | null;
          key?: string | null;
          targetPath?: string | null;
          scope?: string | null;
        }
      | null;
  }) {
    const siblings = await db
      .select()
      .from(issueTable)
      .where(and(eq(issueTable.companyId, args.companyId), eq(issueTable.parentId, args.parentId)));

    const requestedDelegation = normalizeIssueDelegation(args.delegation);
    const requestedTitle = normalizeDelegatedChildTitle(args.title);
    return (
      siblings.find((sibling) => {
        if (TERMINAL_ISSUE_STATUSES.has(sibling.status)) return false;
        if ((args.assigneeAgentId ?? null) !== (sibling.assigneeAgentId ?? null)) return false;
        if ((args.assigneeUserId ?? null) !== (sibling.assigneeUserId ?? null)) return false;
        if (requestedDelegation) {
          const siblingDelegation = normalizeIssueDelegation(sibling.delegation);
          if (!siblingDelegation) return false;
          return (
            siblingDelegation.kind === requestedDelegation.kind &&
            siblingDelegation.key === requestedDelegation.key
          );
        }
        return normalizeDelegatedChildTitle(sibling.title) === requestedTitle;
      }) ?? null
    );
  }

  async function assertCanAssignTasks(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") {
      if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
      const allowed = await access.canUser(companyId, req.actor.userId, "tasks:assign");
      if (!allowed) throw forbidden("Missing permission: tasks:assign");
      return;
    }
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden("Agent authentication required");
      const allowedByGrant = await access.hasPermission(companyId, "agent", req.actor.agentId, "tasks:assign");
      if (allowedByGrant) return;
      const actorAgent = await agentsSvc.getById(req.actor.agentId);
      if (actorAgent && actorAgent.companyId === companyId && canCreateAgentsLegacy(actorAgent)) return;
      throw forbidden("Missing permission: tasks:assign");
    }
    throw unauthorized();
  }

  async function assertIssuePlanApprovalAllowsExecution(
    issueId: string,
    reason: "checkout" | "assign" | "subtask" | "in_progress",
  ) {
    const blockingApprovals = await issueApprovalsSvc.listActiveApprovalsForIssue(
      issueId,
      ["approve_issue_plan", "approve_pull_request"],
      ["pending", "revision_requested"],
    );
    if (blockingApprovals.length === 0) return;
    const blockingPlanApproval = blockingApprovals.find((approval) => approval.type === "approve_issue_plan");
    const blockingPullRequestApproval = blockingApprovals.find(
      (approval) => approval.type === "approve_pull_request" && approval.status === "pending",
    );
    const messageByReason = {
      checkout: "Cannot start work while issue plan approval is pending",
      assign: "Cannot assign work while issue plan approval is pending",
      subtask: "Cannot create subtasks while issue plan approval is pending",
      in_progress: "Cannot move issue to in_progress while issue plan approval is pending",
    } as const;
    if (blockingPlanApproval) {
      throw forbidden(messageByReason[reason]);
    }
    if (blockingPullRequestApproval) {
      throw forbidden("Cannot resume implementation while pull request approval is pending");
    }
  }

  async function assertAncestorIssuePlanApprovalAllowsExecution(
    issueId: string,
    reason: "checkout" | "in_progress",
  ) {
    const ancestors = await svc.getAncestors(issueId);
    if (ancestors.length === 0) return;

    for (const ancestor of ancestors) {
      const blockingApprovals = await issueApprovalsSvc.listActiveApprovalsForIssue(
        ancestor.id,
        ["approve_issue_plan"],
        ["pending", "revision_requested"],
      );
      if (blockingApprovals.length === 0) continue;
      const messageByReason = {
        checkout: "Cannot start work while parent issue plan approval is pending",
        in_progress: "Cannot move issue to in_progress while parent issue plan approval is pending",
      } as const;
      throw forbidden(messageByReason[reason]);
    }
  }

  async function assertIssueCompletionAllowed(issueId: string) {
    const blockingApprovals = await issueApprovalsSvc.listActiveApprovalsForIssue(
      issueId,
      ["approve_pull_request"],
      ["pending", "revision_requested"],
    );
    if (blockingApprovals.length > 0) {
      throw conflict("Cannot mark issue done while pull request approval is pending", {
        approvalIds: blockingApprovals.map((approval) => approval.id),
      });
    }
  }

  function extractPlanText(description: string | null | undefined) {
    if (!description) return null;
    const match = description.match(/<plan>\s*([\s\S]*?)\s*<\/plan>/i);
    return match ? match[1].trim() : null;
  }

  async function buildExecutionWorkspacePlan(
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>,
  ) {
    if (!issue.projectId) {
      throw conflict("Issue must belong to a project before requesting implementation approval.");
    }
    const projectWorkspaces = await projectsSvc.listWorkspaces(issue.projectId);
    return buildExecutionWorkspacePlanForIssue({
      issue,
      projectWorkspaces,
    });
  }

  async function findExistingActionableIssueApproval(args: {
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    type: "approve_issue_plan" | "approve_pull_request";
  }) {
    const { issue, type } = args;
    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(issue.id);
    const linkedExisting = linkedApprovals.find(
      (approval) =>
        approval.type === type && (approval.status === "pending" || approval.status === "revision_requested"),
    );
    if (linkedExisting) return linkedExisting;

    return approvalsSvc.findActionableForIssue({
      companyId: issue.companyId,
      type,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
    });
  }

  async function maybeBlockIssueForPendingPlanApproval(args: {
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    actor: ReturnType<typeof getActorInfo>;
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

  function extractBranchName(...sources: Array<string | null | undefined>) {
    for (const source of sources) {
      if (!source) continue;
      const match = source.match(/\b(?:feature|bugfix|hotfix|chore|fix|refactor)\/[A-Za-z0-9._/-]+\b/);
      if (match) return match[0];
    }
    return null;
  }

  async function resolveIssueBranchName(
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>,
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

  async function resolveIssueBaseBranch(
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>,
    fallback = "main",
  ) {
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

  async function maybeCreateBoardReviewApproval(args: {
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    existing: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    actor: ReturnType<typeof getActorInfo>;
    commentBody?: string;
    isAgentReturningIssueToCreator: boolean;
  }) {
    const { issue, existing, actor, commentBody, isAgentReturningIssueToCreator } = args;
    if (!isAgentReturningIssueToCreator) return;
    if (actor.actorType !== "agent" || !actor.agentId) return;
    if (issue.status !== "in_review") return;
    if (!issue.assigneeUserId || !existing.createdByUserId || issue.assigneeUserId !== existing.createdByUserId) return;

    const planText = extractPlanText(issue.description);
    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(issue.id);
    const hasApprovedPlanApproval = linkedApprovals.some(
      (approval) => approval.type === "approve_issue_plan" && approval.status === "approved",
    );

    const approvalType = planText && !hasApprovedPlanApproval ? "approve_issue_plan" : "approve_pull_request";
    const existingActionableApproval = await findExistingActionableIssueApproval({
      issue,
      type: approvalType,
    });
    if (existingActionableApproval) {
      await issueApprovalsSvc.link(issue.id, existingActionableApproval.id, {
        agentId: actor.agentId,
        userId: null,
      });
      return;
    }

    const workspacePlan =
      approvalType === "approve_issue_plan" ? await buildExecutionWorkspacePlan(issue) : null;
    const branchName =
      approvalType === "approve_pull_request"
        ? await resolveIssueBranchName(issue, commentBody, issue.description)
        : workspacePlan?.branch ?? extractBranchName(commentBody, issue.description);
    const baseBranch = await resolveIssueBaseBranch(issue);
    const approvalPayload =
      approvalType === "approve_issue_plan"
        ? {
            title: issue.title,
            issueIdentifier: issue.identifier,
            plan: planText,
            workspace: workspacePlan,
            summary: commentBody ?? "Requesting board approval for the proposed implementation plan.",
          }
        : {
            title: issue.title,
            issueIdentifier: issue.identifier,
            branch: branchName,
            baseBranch,
            summary: commentBody ?? "Requesting board approval before opening a pull request.",
          };

    const approval = await approvalsSvc.create(issue.companyId, {
      type: approvalType,
      requestedByAgentId: actor.agentId,
      requestedByUserId: null,
      payload: approvalPayload,
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    await issueApprovalsSvc.link(issue.id, approval.id, {
      agentId: actor.agentId,
      userId: null,
    });

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: [issue.id], source: "issue.review_handoff" },
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
      details: { approvalId: approval.id, source: "issue.review_handoff" },
    });

    if (approvalType === "approve_issue_plan") {
      await maybeBlockIssueForPendingPlanApproval({
        issue,
        actor,
        approvalId: approval.id,
        source: "issue.review_handoff",
      });
    }
  }

  async function maybeCreatePullRequestApprovalForBoardHandoff(args: {
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    existing: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    actor: ReturnType<typeof getActorInfo>;
    commentBody?: string;
  }) {
    const { issue, existing, actor, commentBody } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;
    if (issue.status !== "in_review") return;
    if (!issue.assigneeUserId || !existing.createdByUserId || issue.assigneeUserId !== existing.createdByUserId) return;

    const existingActionableApproval = await findExistingActionableIssueApproval({
      issue,
      type: "approve_pull_request",
    });
    if (existingActionableApproval) {
      await issueApprovalsSvc.link(issue.id, existingActionableApproval.id, {
        agentId: actor.agentId,
        userId: null,
      });
      return;
    }

    const branchName = await resolveIssueBranchName(issue, commentBody, issue.description);
    const baseBranch = await resolveIssueBaseBranch(issue);
    const approval = await approvalsSvc.create(issue.companyId, {
      type: "approve_pull_request",
      requestedByAgentId: actor.agentId,
      requestedByUserId: null,
      payload: {
        title: issue.title,
        issueIdentifier: issue.identifier,
        branch: branchName,
        baseBranch,
        summary: commentBody ?? "Requesting board approval before opening a pull request.",
      },
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    await issueApprovalsSvc.link(issue.id, approval.id, {
      agentId: actor.agentId,
      userId: null,
    });

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: [issue.id], source: "issue.review_handoff" },
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
      details: { approvalId: approval.id, source: "issue.review_handoff" },
    });
  }

  async function maybeAdvanceParentAfterChildReviewCompletion(args: {
    issue: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    existing: NonNullable<Awaited<ReturnType<typeof svc.getById>>>;
    actor: ReturnType<typeof getActorInfo>;
  }) {
    const { issue, existing, actor } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;
    if (!existing.parentId || existing.status !== "in_review" || issue.status !== "done") return;

    const parentIssue = await svc.getById(existing.parentId);
    if (!parentIssue) return;

    const directChildren = await db
      .select({
        id: issueTable.id,
        identifier: issueTable.identifier,
        status: issueTable.status,
      })
      .from(issueTable)
      .where(and(eq(issueTable.companyId, parentIssue.companyId), eq(issueTable.parentId, parentIssue.id)));
    const nonTerminalChildren = directChildren.filter((child) => !TERMINAL_ISSUE_STATUSES.has(child.status));
    if (nonTerminalChildren.length > 0) return;

    if (
      parentIssue.status === "in_review" &&
      parentIssue.assigneeAgentId == null &&
      parentIssue.assigneeUserId != null &&
      parentIssue.assigneeUserId === parentIssue.createdByUserId
    ) {
      return;
    }

    const parentPatch = rewriteParentAgentDoneToReview({
      patch: { status: "done" },
      createdByUserId: parentIssue.createdByUserId,
    });
    const updatedParent = await svc.update(parentIssue.id, parentPatch);
    if (!updatedParent) return;

    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(parentPatch)) {
      if (
        key in parentIssue &&
        (parentIssue as Record<string, unknown>)[key] !== (parentPatch as Record<string, unknown>)[key]
      ) {
        previous[key] = (parentIssue as Record<string, unknown>)[key];
      }
    }

    await logActivity(db, {
      companyId: updatedParent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.updated",
      entityType: "issue",
      entityId: updatedParent.id,
      details: {
        ...parentPatch,
        identifier: updatedParent.identifier,
        _previous: Object.keys(previous).length > 0 ? previous : undefined,
      },
    });

    const summary =
      `## 리뷰 완료 — 보드 승인 요청\n\n` +
      `하위 이슈 리뷰가 모두 끝났습니다. PR 승인 후 parent를 마감할 수 있습니다.\n\n` +
      directChildren
        .map((child) => {
          const issuePrefix = parentIssue.identifier?.split("-")[0] ?? "issues";
          return `- [${child.identifier}](/${issuePrefix}/issues/${child.identifier})`;
        })
        .join("\n");

    await maybeCreatePullRequestApprovalForBoardHandoff({
      issue: updatedParent,
      existing: parentIssue,
      actor,
      commentBody: summary,
    });

    const parentComment = await svc.addComment(parentIssue.id, summary, {
      agentId: actor.agentId ?? undefined,
    });
    await logActivity(db, {
      companyId: updatedParent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_added",
      entityType: "issue",
      entityId: updatedParent.id,
      details: {
        commentId: parentComment.id,
        bodySnippet: parentComment.body.slice(0, 120),
        identifier: updatedParent.identifier,
        issueTitle: updatedParent.title,
      },
    });
  }

  async function maybeCreateParentPlanApprovalForDelegation(args: {
    parentIssueId: string;
    actor: ReturnType<typeof getActorInfo>;
    summary?: string;
    source: "subtask_create" | "assignee_change";
  }) {
    const { parentIssueId, actor, summary, source } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;

    const parentIssue = await svc.getById(parentIssueId);
    if (!parentIssue) return;

    const planText = extractPlanText(parentIssue.description);
    const workspacePlan = await buildExecutionWorkspacePlan(parentIssue);

    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(parentIssue.id);
    const hasApprovedPlanApproval = linkedApprovals.some(
      (approval) => approval.type === "approve_issue_plan" && approval.status === "approved",
    );
    if (hasApprovedPlanApproval) return;

    const existingActionableApproval = await findExistingActionableIssueApproval({
      issue: parentIssue,
      type: "approve_issue_plan",
    });
    if (existingActionableApproval) {
      await issueApprovalsSvc.link(parentIssue.id, existingActionableApproval.id, {
        agentId: actor.agentId,
        userId: null,
      });
      return;
    }

    const approval = await approvalsSvc.create(parentIssue.companyId, {
      type: "approve_issue_plan",
      requestedByAgentId: actor.agentId,
      requestedByUserId: null,
      payload: {
        title: parentIssue.title,
        issueIdentifier: parentIssue.identifier,
        plan: planText,
        description: parentIssue.description,
        branch: workspacePlan?.branch ?? extractBranchName(parentIssue.description),
        workspace: workspacePlan,
        summary:
          summary ??
          "Requesting board approval for the implementation plan and delegated subtasks before execution starts.",
      },
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    await issueApprovalsSvc.link(parentIssue.id, approval.id, {
      agentId: actor.agentId,
      userId: null,
    });

    await logActivity(db, {
      companyId: parentIssue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: [parentIssue.id], source },
    });

    await logActivity(db, {
      companyId: parentIssue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.approval_linked",
      entityType: "issue",
      entityId: parentIssue.id,
      details: { approvalId: approval.id, source },
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
    actor: ReturnType<typeof getActorInfo>;
    source: "subtask_create" | "assignee_change";
  }) {
    const { parentIssueId, actor, source } = args;
    if (actor.actorType !== "agent" || !actor.agentId) return;

    const parentIssue = await svc.getById(parentIssueId);
    if (!parentIssue) return;

    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(parentIssue.id);
    const hasApprovedPlanApproval = linkedApprovals.some(
      (approval) => approval.type === "approve_issue_plan" && approval.status === "approved",
    );
    if (hasApprovedPlanApproval) return;

    await maybeCreateParentPlanApprovalForDelegation({
      parentIssueId,
      actor,
      source,
    });

    const messageBySource = {
      subtask_create: "Parent issue plan approval is required before creating subtasks",
      assignee_change: "Parent issue plan approval is required before assigning delegated subtasks",
    } as const;

    throw conflict(messageBySource[source], {
      parentIssueId,
      source,
    });
  }

  function requireAgentRunId(req: Request, res: Response) {
    if (req.actor.type !== "agent") return null;
    const runId = req.actor.runId?.trim();
    if (runId) return runId;
    res.status(401).json({ error: "Agent run id required" });
    return null;
  }

  async function assertAgentRunCheckoutOwnership(
    req: Request,
    res: Response,
    issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
  ) {
    if (req.actor.type !== "agent") return true;
    const actorAgentId = req.actor.agentId;
    if (!actorAgentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    if (issue.status !== "in_progress" || issue.assigneeAgentId !== actorAgentId) {
      return true;
    }
    const runId = requireAgentRunId(req, res);
    if (!runId) return false;
    const ownership = await svc.assertCheckoutOwner(issue.id, actorAgentId, runId);
    if (ownership.adoptedFromRunId) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.checkout_lock_adopted",
        entityType: "issue",
        entityId: issue.id,
        details: {
          previousCheckoutRunId: ownership.adoptedFromRunId,
          checkoutRunId: runId,
          reason: "stale_checkout_run",
        },
      });
    }
    return true;
  }

  async function normalizeIssueIdentifier(rawId: string): Promise<string> {
    if (/^[A-Z]+-\d+$/i.test(rawId)) {
      const issue = await svc.getByIdentifier(rawId);
      if (issue) {
        return issue.id;
      }
    }
    return rawId;
  }

  // Resolve issue identifiers (e.g. "PAP-39") to UUIDs for all /issues/:id routes
  router.param("id", async (req, res, next, rawId) => {
    try {
      req.params.id = await normalizeIssueIdentifier(rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  // Resolve issue identifiers (e.g. "PAP-39") to UUIDs for company-scoped attachment routes.
  router.param("issueId", async (req, res, next, rawId) => {
    try {
      req.params.issueId = await normalizeIssueIdentifier(rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/issues", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const assigneeUserFilterRaw = req.query.assigneeUserId as string | undefined;
    const assigneeUserId =
      assigneeUserFilterRaw === "me" && req.actor.type === "board"
        ? req.actor.userId
        : assigneeUserFilterRaw;

    if (assigneeUserFilterRaw === "me" && (!assigneeUserId || req.actor.type !== "board")) {
      res.status(403).json({ error: "assigneeUserId=me requires board authentication" });
      return;
    }

    const result = await svc.list(companyId, {
      status: req.query.status as string | undefined,
      assigneeAgentId: req.query.assigneeAgentId as string | undefined,
      assigneeUserId,
      projectId: req.query.projectId as string | undefined,
      labelId: req.query.labelId as string | undefined,
      q: req.query.q as string | undefined,
    });
    res.json(result);
  });

  router.get("/companies/:companyId/labels", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.listLabels(companyId);
    res.json(result);
  });

  router.post("/companies/:companyId/labels", validate(createIssueLabelSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const label = await svc.createLabel(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "label.created",
      entityType: "label",
      entityId: label.id,
      details: { name: label.name, color: label.color },
    });
    res.status(201).json(label);
  });

  router.delete("/labels/:labelId", async (req, res) => {
    const labelId = req.params.labelId as string;
    const existing = await svc.getLabelById(labelId);
    if (!existing) {
      res.status(404).json({ error: "Label not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const removed = await svc.deleteLabel(labelId);
    if (!removed) {
      res.status(404).json({ error: "Label not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "label.deleted",
      entityType: "label",
      entityId: removed.id,
      details: { name: removed.name, color: removed.color },
    });
    res.json(removed);
  });

  router.get("/issues/:id", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const [ancestors, project, goal, mentionedProjectIds, executionWorkspace] = await Promise.all([
      svc.getAncestors(issue.id),
      issue.projectId ? projectsSvc.getById(issue.projectId) : null,
      issue.goalId ? goalsSvc.getById(issue.goalId) : null,
      svc.findMentionedProjectIds(issue.id),
      issue.executionWorkspaceId ? executionWorkspacesSvc.getById(issue.executionWorkspaceId) : null,
    ]);
    const mentionedProjects = mentionedProjectIds.length > 0
      ? await projectsSvc.listByIds(issue.companyId, mentionedProjectIds)
      : [];
    const shouldSanitizeSourceRepoPaths = req.actor.type === "agent" && !!issue.executionWorkspaceId;
    const responseAncestors = shouldSanitizeSourceRepoPaths
      ? ancestors.map((ancestor) => ({
          ...ancestor,
          project: sanitizeProjectWorkspacePaths(ancestor.project),
        }))
      : ancestors;
    const responseProject = shouldSanitizeSourceRepoPaths
      ? sanitizeProjectWorkspacePaths(project)
      : project;
    const responseMentionedProjects = shouldSanitizeSourceRepoPaths
      ? mentionedProjects.map((mentionedProject) => sanitizeProjectWorkspacePaths(mentionedProject))
      : mentionedProjects;

    res.json({
      ...issue,
      ancestors: responseAncestors,
      project: responseProject ?? null,
      goal: goal ?? null,
      mentionedProjects: responseMentionedProjects,
      executionWorkspace:
        executionWorkspace && typeof executionWorkspace.executionCwd === "string"
          ? {
              id: executionWorkspace.id,
              cwd: executionWorkspace.executionCwd,
              branch: executionWorkspace.branch,
              baseBranch: executionWorkspace.baseBranch,
              ticketKey: executionWorkspace.ticketKey,
            }
          : null,
    });
  });

  router.get("/issues/:id/approvals", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id);
    res.json(approvals);
  });

  router.post("/issues/:id/approvals", validate(linkIssueApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (!(await assertCanManageIssueApprovalLinks(req, res, issue.companyId))) return;

    const actor = getActorInfo(req);
    await issueApprovalsSvc.link(id, req.body.approvalId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
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
      details: { approvalId: req.body.approvalId },
    });

    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id);
    res.status(201).json(approvals);
  });

  router.delete("/issues/:id/approvals/:approvalId", async (req, res) => {
    const id = req.params.id as string;
    const approvalId = req.params.approvalId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (!(await assertCanManageIssueApprovalLinks(req, res, issue.companyId))) return;

    await issueApprovalsSvc.unlink(id, approvalId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.approval_unlinked",
      entityType: "issue",
      entityId: issue.id,
      details: { approvalId },
    });

    res.json({ ok: true });
  });

  router.post("/companies/:companyId/issues", validate(createIssueSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (typeof req.body.parentId === "string" && req.body.parentId.length > 0) {
      await assertIssuePlanApprovalAllowsExecution(req.body.parentId, "subtask");
      await assertParentPlanApprovedBeforeDelegation({
        parentIssueId: req.body.parentId,
        actor: getActorInfo(req),
        source: "subtask_create",
      });
    }
    if (req.body.assigneeAgentId || req.body.assigneeUserId) {
      await assertCanAssignTasks(req, companyId);
    }

    const actor = getActorInfo(req);
    if (typeof req.body.parentId === "string" && req.body.parentId.length > 0) {
      const existingChild = await findReusableActiveChildIssue({
        companyId,
        parentId: req.body.parentId,
        assigneeAgentId: req.body.assigneeAgentId ?? null,
        assigneeUserId: req.body.assigneeUserId ?? null,
        title: req.body.title,
        delegation: req.body.delegation ?? null,
      });
      if (existingChild) {
        res.status(200).json(existingChild);
        return;
      }
    }

    const issue = await svc.create(companyId, {
      ...req.body,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.created",
      entityType: "issue",
      entityId: issue.id,
      details: { title: issue.title, identifier: issue.identifier },
    });

    if (issue.assigneeAgentId) {
      void heartbeat
        .wakeup(issue.assigneeAgentId, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_assigned",
          payload: { issueId: issue.id, mutation: "create" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.create" },
        })
        .catch((err) => logger.warn({ err, issueId: issue.id }, "failed to wake assignee on issue create"));
    }

    res.status(201).json(issue);
  });

  router.patch("/issues/:id", validate(updateIssueSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const actor = getActorInfo(req);
    const { comment: commentBody, hiddenAt: hiddenAtRaw, ...requestedUpdateFields } = req.body;
    if (hiddenAtRaw !== undefined) {
      requestedUpdateFields.hiddenAt = hiddenAtRaw ? new Date(hiddenAtRaw) : null;
    }

    let updateFields = { ...requestedUpdateFields };
    let workflowForcedAssigneeChange = false;

    // Governed completion flow for assignee agents:
    // - child in_progress done -> in_review (+ optional leader reassignment)
    // - child in_progress in_review -> in_review (+ optional leader reassignment)
    // - child in_review done -> allowed as reviewer completion
    // - top-level done -> blocked if active children, otherwise in_review + creator reassignment
    if (
      isAssigneeAgentDoneAttempt({
        actor: { type: req.actor.type, agentId: req.actor.type === "agent" ? req.actor.agentId : null },
        issue: {
          parentId: existing.parentId,
          assigneeAgentId: existing.assigneeAgentId,
          createdByUserId: existing.createdByUserId,
        },
        patch: updateFields,
      })
    ) {
      if (typeof existing.parentId === "string" && existing.parentId.length > 0) {
        if (!isAssigneeAgentReviewCompletionAttempt({
          actor: { type: req.actor.type, agentId: req.actor.type === "agent" ? req.actor.agentId : null },
          issue: {
            parentId: existing.parentId,
            assigneeAgentId: existing.assigneeAgentId,
            createdByUserId: existing.createdByUserId,
            status: existing.status,
          },
          patch: updateFields,
        })) {
          const parentIssue = await svc.getById(existing.parentId);
          updateFields = rewriteChildAgentDoneToReview({
            patch: updateFields,
            parentAssigneeAgentId: parentIssue?.assigneeAgentId ?? null,
          });
          if (parentIssue?.assigneeAgentId) {
            workflowForcedAssigneeChange = true;
          }
        }
      } else {
        const directChildren = await db
          .select({
            id: issueTable.id,
            identifier: issueTable.identifier,
            status: issueTable.status,
          })
          .from(issueTable)
          .where(and(eq(issueTable.companyId, existing.companyId), eq(issueTable.parentId, existing.id)));
        const nonTerminalChildren = directChildren.filter((child) => !TERMINAL_ISSUE_STATUSES.has(child.status));
        if (nonTerminalChildren.length > 0) {
          throw conflict("Cannot mark parent issue done while direct child issues are still active", {
            issueId: existing.id,
            openChildIssueIds: nonTerminalChildren.map((child) => child.id),
            openChildIssueIdentifiers: nonTerminalChildren.map((child) => child.identifier),
          });
        }
        updateFields = rewriteParentAgentDoneToReview({
          patch: updateFields,
          createdByUserId: existing.createdByUserId,
        });
        workflowForcedAssigneeChange = true;
      }
    }

    if (
      isAssigneeAgentReviewRequestAttempt({
        actor: { type: req.actor.type, agentId: req.actor.type === "agent" ? req.actor.agentId : null },
        issue: {
          parentId: existing.parentId,
          assigneeAgentId: existing.assigneeAgentId,
          createdByUserId: existing.createdByUserId,
        },
        patch: updateFields,
      })
    ) {
      if (typeof existing.parentId === "string" && existing.parentId.length > 0) {
        const parentIssue = await svc.getById(existing.parentId);
        updateFields = rewriteChildAgentDoneToReview({
          patch: updateFields,
          parentAssigneeAgentId: parentIssue?.assigneeAgentId ?? null,
        });
        if (parentIssue?.assigneeAgentId) {
          workflowForcedAssigneeChange = true;
        }
      }
    }

    const requestedAssigneeWillChange =
      (req.body.assigneeAgentId !== undefined && req.body.assigneeAgentId !== existing.assigneeAgentId) ||
      (req.body.assigneeUserId !== undefined && req.body.assigneeUserId !== existing.assigneeUserId);
    const assigneeWillChange =
      (updateFields.assigneeAgentId !== undefined && updateFields.assigneeAgentId !== existing.assigneeAgentId) ||
      (updateFields.assigneeUserId !== undefined && updateFields.assigneeUserId !== existing.assigneeUserId);

    const isAgentReturningIssueToCreator =
      actor.actorType === "agent" &&
      !!actor.agentId &&
      existing.assigneeAgentId === actor.agentId &&
      updateFields.assigneeAgentId === null &&
      typeof updateFields.assigneeUserId === "string" &&
      !!existing.createdByUserId &&
      updateFields.assigneeUserId === existing.createdByUserId;

    if (assigneeWillChange) {
      await assertIssuePlanApprovalAllowsExecution(existing.id, "assign");
      if (!isAgentReturningIssueToCreator && !workflowForcedAssigneeChange) {
        await assertCanAssignTasks(req, existing.companyId);
      }
      if (!workflowForcedAssigneeChange && typeof existing.parentId === "string" && existing.parentId.length > 0) {
        await assertParentPlanApprovedBeforeDelegation({
          parentIssueId: existing.parentId,
          actor,
          source: "assignee_change",
        });
      }
    }
    if (updateFields.status === "in_progress") {
      await assertIssuePlanApprovalAllowsExecution(existing.id, "in_progress");
      await assertAncestorIssuePlanApprovalAllowsExecution(existing.id, "in_progress");
    }
    if (updateFields.status === "done") {
      await assertIssueCompletionAllowed(existing.id);
    }
    if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) return;

    let issue;
    try {
      issue = await svc.update(id, updateFields);
    } catch (err) {
      if (err instanceof HttpError && err.status === 422) {
        logger.warn(
          {
            issueId: id,
            companyId: existing.companyId,
            assigneePatch: {
              assigneeAgentId: updateFields.assigneeAgentId === undefined ? "__omitted__" : updateFields.assigneeAgentId,
              assigneeUserId: updateFields.assigneeUserId === undefined ? "__omitted__" : updateFields.assigneeUserId,
            },
            currentAssignee: {
              assigneeAgentId: existing.assigneeAgentId,
              assigneeUserId: existing.assigneeUserId,
            },
            requestedAssigneeWillChange,
            error: err.message,
            details: err.details,
          },
          "issue update rejected with 422",
        );
      }
      throw err;
    }
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    // Build activity details with previous values for changed fields
    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(updateFields)) {
      if (key in existing && (existing as Record<string, unknown>)[key] !== (updateFields as Record<string, unknown>)[key]) {
        previous[key] = (existing as Record<string, unknown>)[key];
      }
    }
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.updated",
      entityType: "issue",
      entityId: issue.id,
      details: { ...updateFields, identifier: issue.identifier, _previous: Object.keys(previous).length > 0 ? previous : undefined },
    });

    await maybeCreateBoardReviewApproval({
      issue,
      existing,
      actor,
      commentBody,
      isAgentReturningIssueToCreator,
    });

    await maybeAdvanceParentAfterChildReviewCompletion({
      issue,
      existing,
      actor,
    });

    let comment = null;
    if (commentBody) {
      comment = await svc.addComment(id, commentBody, {
        agentId: actor.agentId ?? undefined,
        userId: actor.actorType === "user" ? actor.actorId : undefined,
      });

      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.comment_added",
        entityType: "issue",
        entityId: issue.id,
        details: {
          commentId: comment.id,
          bodySnippet: comment.body.slice(0, 120),
          identifier: issue.identifier,
          issueTitle: issue.title,
        },
      });

    }

    const assigneeChanged = assigneeWillChange;

    // Merge all wakeups from this update into one enqueue per agent to avoid duplicate runs.
    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>();

      if (assigneeChanged && issue.assigneeAgentId) {
        wakeups.set(issue.assigneeAgentId, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_assigned",
          payload: { issueId: issue.id, mutation: "update" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.update" },
        });
      }

      if (commentBody && comment) {
        let mentionedIds: string[] = [];
        try {
          mentionedIds = await svc.findMentionedAgents(issue.companyId, commentBody);
        } catch (err) {
          logger.warn({ err, issueId: id }, "failed to resolve @-mentions");
        }

        for (const mentionedId of mentionedIds) {
          if (wakeups.has(mentionedId)) continue;
          wakeups.set(mentionedId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_comment_mentioned",
            payload: { issueId: id, commentId: comment.id },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: id,
              taskId: id,
              commentId: comment.id,
              wakeCommentId: comment.id,
              wakeReason: "issue_comment_mentioned",
              source: "comment.mention",
            },
          });
        }
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat
          .wakeup(agentId, wakeup)
          .catch((err) => logger.warn({ err, issueId: issue.id, agentId }, "failed to wake agent on issue update"));
      }
    })();

    res.json({ ...issue, comment });
  });

  router.delete("/issues/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    const attachments = await svc.listAttachments(id);

    const issue = await svc.remove(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    for (const attachment of attachments) {
      try {
        await storage.deleteObject(attachment.companyId, attachment.objectKey);
      } catch (err) {
        logger.warn({ err, issueId: id, attachmentId: attachment.id }, "failed to delete attachment object during issue delete");
      }
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.deleted",
      entityType: "issue",
      entityId: issue.id,
    });

    res.json(issue);
  });

  router.post("/issues/:id/checkout", validate(checkoutIssueSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== req.body.agentId) {
      res.status(403).json({ error: "Agent can only checkout as itself" });
      return;
    }

    await assertIssuePlanApprovalAllowsExecution(issue.id, "checkout");
    await assertAncestorIssuePlanApprovalAllowsExecution(issue.id, "checkout");
    const checkoutRunId = requireAgentRunId(req, res);
    if (req.actor.type === "agent" && !checkoutRunId) return;
    const updated = await svc.checkout(id, req.body.agentId, req.body.expectedStatuses, checkoutRunId);
    const actor = getActorInfo(req);

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.checked_out",
      entityType: "issue",
      entityId: issue.id,
      details: { agentId: req.body.agentId },
    });

    void heartbeat
      .wakeup(req.body.agentId, {
        source: "assignment",
        triggerDetail: "system",
        reason: "issue_checked_out",
        payload: { issueId: issue.id, mutation: "checkout" },
        requestedByActorType: actor.actorType,
        requestedByActorId: actor.actorId,
        contextSnapshot: { issueId: issue.id, source: "issue.checkout" },
      })
      .catch((err) => logger.warn({ err, issueId: issue.id }, "failed to wake assignee on issue checkout"));

    res.json(updated);
  });

  router.post("/issues/:id/release", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) return;
    const actorRunId = requireAgentRunId(req, res);
    if (req.actor.type === "agent" && !actorRunId) return;

    const released = await svc.release(
      id,
      req.actor.type === "agent" ? req.actor.agentId : undefined,
      actorRunId,
    );
    if (!released) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: released.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.released",
      entityType: "issue",
      entityId: released.id,
    });

    res.json(released);
  });

  router.get("/issues/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const comments = await svc.listComments(id);
    res.json(comments);
  });

  router.get("/issues/:id/comments/:commentId", async (req, res) => {
    const id = req.params.id as string;
    const commentId = req.params.commentId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const comment = await svc.getComment(commentId);
    if (!comment || comment.issueId !== id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    res.json(comment);
  });

  router.post("/issues/:id/comments", validate(addIssueCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    if (!(await assertAgentRunCheckoutOwnership(req, res, issue))) return;

    const actor = getActorInfo(req);
    const reopenRequested = req.body.reopen === true;
    const interruptRequested = req.body.interrupt === true;
    const isClosed = issue.status === "done" || issue.status === "cancelled";
    let reopened = false;
    let reopenFromStatus: string | null = null;
    let interruptedRunId: string | null = null;
    let currentIssue = issue;

    if (reopenRequested && isClosed) {
      const reopenedIssue = await svc.update(id, { status: "todo" });
      if (!reopenedIssue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      reopened = true;
      reopenFromStatus = issue.status;
      currentIssue = reopenedIssue;

      await logActivity(db, {
        companyId: currentIssue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.updated",
        entityType: "issue",
        entityId: currentIssue.id,
        details: {
          status: "todo",
          reopened: true,
          reopenedFrom: reopenFromStatus,
          source: "comment",
          identifier: currentIssue.identifier,
        },
      });
    }

    if (interruptRequested) {
      if (req.actor.type !== "board") {
        res.status(403).json({ error: "Only board users can interrupt active runs from issue comments" });
        return;
      }

      let runToInterrupt = currentIssue.executionRunId
        ? await heartbeat.getRun(currentIssue.executionRunId)
        : null;

      if (
        (!runToInterrupt || runToInterrupt.status !== "running") &&
        currentIssue.assigneeAgentId
      ) {
        const activeRun = await heartbeat.getActiveRunForAgent(currentIssue.assigneeAgentId);
        const activeIssueId =
          activeRun &&
            activeRun.contextSnapshot &&
            typeof activeRun.contextSnapshot === "object" &&
            typeof (activeRun.contextSnapshot as Record<string, unknown>).issueId === "string"
            ? ((activeRun.contextSnapshot as Record<string, unknown>).issueId as string)
            : null;
        if (activeRun && activeRun.status === "running" && activeIssueId === currentIssue.id) {
          runToInterrupt = activeRun;
        }
      }

      if (runToInterrupt && runToInterrupt.status === "running") {
        const cancelled = await heartbeat.cancelRun(runToInterrupt.id);
        if (cancelled) {
          interruptedRunId = cancelled.id;
          await logActivity(db, {
            companyId: cancelled.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "heartbeat.cancelled",
            entityType: "heartbeat_run",
            entityId: cancelled.id,
            details: { agentId: cancelled.agentId, source: "issue_comment_interrupt", issueId: currentIssue.id },
          });
        }
      }
    }

    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: currentIssue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_added",
      entityType: "issue",
      entityId: currentIssue.id,
      details: {
        commentId: comment.id,
        bodySnippet: comment.body.slice(0, 120),
        identifier: currentIssue.identifier,
        issueTitle: currentIssue.title,
        ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus, source: "comment" } : {}),
        ...(interruptedRunId ? { interruptedRunId } : {}),
      },
    });

    // Merge all wakeups from this comment into one enqueue per agent to avoid duplicate runs.
    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>();
      const assigneeId = currentIssue.assigneeAgentId;
      if (assigneeId) {
        if (reopened) {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_reopened_via_comment",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              reopenedFrom: reopenFromStatus,
              mutation: "comment",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              source: "issue.comment.reopen",
              wakeReason: "issue_reopened_via_comment",
              reopenedFrom: reopenFromStatus,
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        } else {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_commented",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              mutation: "comment",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              source: "issue.comment",
              wakeReason: "issue_commented",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        }
      }

      let mentionedIds: string[] = [];
      try {
        mentionedIds = await svc.findMentionedAgents(issue.companyId, req.body.body);
      } catch (err) {
        logger.warn({ err, issueId: id }, "failed to resolve @-mentions");
      }

      for (const mentionedId of mentionedIds) {
        if (wakeups.has(mentionedId)) continue;
        wakeups.set(mentionedId, {
          source: "automation",
          triggerDetail: "system",
          reason: "issue_comment_mentioned",
          payload: { issueId: id, commentId: comment.id },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: {
            issueId: id,
            taskId: id,
            commentId: comment.id,
            wakeCommentId: comment.id,
            wakeReason: "issue_comment_mentioned",
            source: "comment.mention",
          },
        });
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat
          .wakeup(agentId, wakeup)
          .catch((err) => logger.warn({ err, issueId: currentIssue.id, agentId }, "failed to wake agent on issue comment"));
      }
    })();

    res.status(201).json(comment);
  });

  router.get("/issues/:id/attachments", async (req, res) => {
    const issueId = req.params.id as string;
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const attachments = await svc.listAttachments(issueId);
    res.json(attachments.map(withContentPath));
  });

  router.post("/companies/:companyId/issues/:issueId/attachments", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    assertCompanyAccess(req, companyId);
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (issue.companyId !== companyId) {
      res.status(422).json({ error: "Issue does not belong to company" });
      return;
    }

    try {
      await runSingleFileUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const contentType = (file.mimetype || "").toLowerCase();
    if (!ALLOWED_ATTACHMENT_CONTENT_TYPES.has(contentType)) {
      res.status(422).json({ error: `Unsupported attachment type: ${contentType || "unknown"}` });
      return;
    }
    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Attachment is empty" });
      return;
    }

    const parsedMeta = createIssueAttachmentMetadataSchema.safeParse(req.body ?? {});
    if (!parsedMeta.success) {
      res.status(400).json({ error: "Invalid attachment metadata", details: parsedMeta.error.issues });
      return;
    }

    const actor = getActorInfo(req);
    const stored = await storage.putFile({
      companyId,
      namespace: `issues/${issueId}`,
      originalFilename: file.originalname || null,
      contentType,
      body: file.buffer,
    });

    const attachment = await svc.createAttachment({
      issueId,
      issueCommentId: parsedMeta.data.issueCommentId ?? null,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_added",
      entityType: "issue",
      entityId: issueId,
      details: {
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
      },
    });

    res.status(201).json(withContentPath(attachment));
  });

  router.get("/attachments/:attachmentId/content", async (req, res, next) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    assertCompanyAccess(req, attachment.companyId);

    const object = await storage.getObject(attachment.companyId, attachment.objectKey);
    res.setHeader("Content-Type", attachment.contentType || object.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(attachment.byteSize || object.contentLength || 0));
    res.setHeader("Cache-Control", "private, max-age=60");
    const filename = attachment.originalFilename ?? "attachment";
    res.setHeader("Content-Disposition", `inline; filename=\"${filename.replaceAll("\"", "")}\"`);

    object.stream.on("error", (err) => {
      next(err);
    });
    object.stream.pipe(res);
  });

  router.delete("/attachments/:attachmentId", async (req, res) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    assertCompanyAccess(req, attachment.companyId);

    try {
      await storage.deleteObject(attachment.companyId, attachment.objectKey);
    } catch (err) {
      logger.warn({ err, attachmentId }, "storage delete failed while removing attachment");
    }

    const removed = await svc.removeAttachment(attachmentId);
    if (!removed) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_removed",
      entityType: "issue",
      entityId: removed.issueId,
      details: {
        attachmentId: removed.id,
      },
    });

    res.json({ ok: true });
  });

  return router;
}
