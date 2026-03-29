import { Router, type Request, type Response } from "express";
import { issues as issueTable, type Db } from "@atototo/db";
import { and, eq } from "drizzle-orm";
import {
  createIssueLabelSchema,
  checkoutIssueSchema,
  createIssueSchema,
  linkIssueApprovalSchema,
  updateIssueSchema,
} from "@atototo/shared";
import type { StorageService } from "../../storage/types.js";
import { validate } from "../../middleware/validate.js";
import {
  accessService,
  agentService,
  approvalService,
  executionWorkspaceService,
  goalService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  projectService,
} from "../../services/index.js";
import { logger } from "../../middleware/logger.js";
import { conflict, forbidden, HttpError, unauthorized } from "../../errors.js";
import { assertCompanyAccess, getActorInfo } from "../authz.js";
import { issueCommentRoutes } from "./comment-routes.js";
import { sanitizeProjectWorkspacePaths } from "./response.js";
import { issueAttachmentRoutes } from "./attachment-routes.js";
import { createIssueApprovalHelpers, type ActorInfo } from "./approval-helpers.js";
import {
  isAssigneeAgentReviewCompletionAttempt,
  isAssigneeAgentDoneAttempt,
  isAssigneeAgentReviewRequestAttempt,
  rewriteChildAgentDoneToReview,
  rewriteParentAgentDoneToReview,
  TERMINAL_ISSUE_STATUSES,
} from "./workflow.js";

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
      ["approve_pull_request", "approve_completion"],
      ["pending", "revision_requested"],
    );
    if (blockingApprovals.length > 0) {
      throw conflict("Cannot mark issue done while approval is pending", {
        approvalIds: blockingApprovals.map((approval) => approval.id),
      });
    }
  }

  type IssueRow = NonNullable<Awaited<ReturnType<typeof svc.getById>>>;

  // --- Approval helpers (extracted to approval-helpers.ts) ---
  const {
    maybeCreateBoardReviewApproval,
    assertParentPlanApprovedBeforeDelegation,
  } = createIssueApprovalHelpers({ db, svc, approvalsSvc, issueApprovalsSvc, projectsSvc, executionWorkspacesSvc });

  async function maybeAdvanceParentAfterChildReviewCompletion(args: {
    issue: IssueRow;
    existing: IssueRow;
    actor: ActorInfo;
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

    await maybeCreateBoardReviewApproval({
      issue: updatedParent,
      existing: parentIssue,
      actor,
      commentBody: summary,
      isAgentReturningIssueToCreator: true,
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

  router.use(issueAttachmentRoutes(db, storage));

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
              syncStatus: executionWorkspace.syncStatus,
              syncMethod: executionWorkspace.syncMethod,
              lastSyncedAt: executionWorkspace.lastSyncedAt,
              lastVerifiedAt: executionWorkspace.lastVerifiedAt,
              lastPrCheckedAt: executionWorkspace.lastPrCheckedAt,
              lastBaseCommitSha: executionWorkspace.lastBaseCommitSha,
              lastBranchCommitSha: executionWorkspace.lastBranchCommitSha,
              pullRequestUrl: executionWorkspace.pullRequestUrl,
              pullRequestNumber: executionWorkspace.pullRequestNumber,
              prOpenedAt: executionWorkspace.prOpenedAt,
              lastDriftDetectedAt: executionWorkspace.lastDriftDetectedAt,
              conflictSummary: executionWorkspace.conflictSummary,
              escalationSummary: executionWorkspace.escalationSummary,
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
    const { comment: commentBody, hiddenAt: hiddenAtRaw, delegations: requestDelegations, ...requestedUpdateFields } = req.body;
    if (hiddenAtRaw !== undefined) {
      requestedUpdateFields.hiddenAt = hiddenAtRaw ? new Date(hiddenAtRaw) : null;
    }

    let updateFields = { ...requestedUpdateFields };
    let workflowForcedAssigneeChange = false;

    // Determine if this PATCH actually mutates issue fields (beyond the
    // already-extracted comment / hiddenAt / delegations).  When the only
    // intent is to post a comment we must skip approval guards and the
    // svc.update() call so that board users can always leave feedback, even
    // while a pull-request approval is pending.
    const hasFieldMutations = Object.keys(updateFields).length > 0;

    // When the PATCH carries only a comment (no field mutations) we skip all
    // governance guards and the svc.update() call so that board users can
    // always post feedback — even while a pull-request approval is pending.
    let issue = existing;
    let assigneeWillChange = false;
    let isAgentReturningIssueToCreator = false;

    if (hasFieldMutations) {
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
      assigneeWillChange =
        (updateFields.assigneeAgentId !== undefined && updateFields.assigneeAgentId !== existing.assigneeAgentId) ||
        (updateFields.assigneeUserId !== undefined && updateFields.assigneeUserId !== existing.assigneeUserId);

      // Agent-created issues have no createdByUserId — allow returning to any board user
      isAgentReturningIssueToCreator =
        actor.actorType === "agent" &&
        !!actor.agentId &&
        existing.assigneeAgentId === actor.agentId &&
        updateFields.assigneeAgentId === null &&
        typeof updateFields.assigneeUserId === "string" &&
        (existing.createdByUserId
          ? updateFields.assigneeUserId === existing.createdByUserId
          : true);

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
      if (updateFields.status === "in_review") {
        // Block in_review transition if there's a pending agent_question for this issue
        const pendingQuestions = await issueApprovalsSvc.listActiveApprovalsForIssue(
          existing.id,
          ["agent_question"],
          ["pending"],
        );
        if (pendingQuestions.length > 0) {
          throw forbidden(
            "Cannot submit for review while an agent question is pending. Answer the question first.",
          );
        }
        // Block in_review transition if there are active (non-terminal) child issues
        const childIssues = await db
          .select({ id: issueTable.id, identifier: issueTable.identifier, status: issueTable.status })
          .from(issueTable)
          .where(and(eq(issueTable.parentId, existing.id), eq(issueTable.companyId, existing.companyId)));
        const activeChildren = childIssues.filter((c) => !TERMINAL_ISSUE_STATUSES.has(c.status));
        if (activeChildren.length > 0) {
          const childList = activeChildren.map((c) => `${c.identifier ?? c.id} (${c.status})`).join(", ");
          throw forbidden(
            `Cannot submit for review while child issues are still active: ${childList}. Complete or cancel all child issues first.`,
          );
        }
      }
      if (updateFields.status === "done") {
        await assertIssueCompletionAllowed(existing.id);
      }
      if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) return;

      try {
        const updated = await svc.update(id, updateFields);
        if (!updated) {
          res.status(404).json({ error: "Issue not found" });
          return;
        }
        issue = updated;
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

      try {
        await maybeCreateBoardReviewApproval({
          issue,
          existing,
          actor,
          commentBody,
          isAgentReturningIssueToCreator,
          delegations: requestDelegations,
        });
      } catch (approvalErr) {
        // Approval creation failed after the issue update was already committed.
        // Roll back the status change so the issue doesn't get stuck in
        // in_review without an approval object in the inbox.
        if (isAgentReturningIssueToCreator && issue.status === "in_review") {
          logger.warn(
            { issueId: id, error: (approvalErr as Error).message },
            "approval creation failed after issue update — rolling back status to in_progress",
          );
          await svc.update(id, {
            status: existing.status,
            assigneeAgentId: existing.assigneeAgentId,
            assigneeUserId: existing.assigneeUserId,
          });
        }
        throw approvalErr;
      }

      await maybeAdvanceParentAfterChildReviewCompletion({
        issue,
        existing,
        actor,
      });
    }

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

  router.use(issueCommentRoutes(db));

  return router;
}
