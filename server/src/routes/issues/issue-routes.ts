import { Router, type Request, type Response } from "express";
import { issues as issueTable, type Db } from "@atototo/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
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
  issueWorkflowSessionService,
  issueWorkflowOrchestrator,
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
  TERMINAL_ISSUE_STATUSES,
} from "./workflow.js";

export function issueRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = issueService(db);
  const workflowOrchestrator = issueWorkflowOrchestrator(db);
  const access = accessService(db);
  const heartbeat = heartbeatService(db);
  const executionWorkspacesSvc = executionWorkspaceService(db);
  const agentsSvc = agentService(db);
  const approvalsSvc = approvalService(db);
  const workflowSessionsSvc = issueWorkflowSessionService(db);
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

  async function findReusableActiveChildIssue(args: {
    companyId: string;
    parentId: string;
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
    const terminalStatuses = [...TERMINAL_ISSUE_STATUSES];
    const delegationKind = args.delegation?.kind?.trim().toLowerCase();
    const delegationKey = args.delegation?.key?.trim().toLowerCase();

    // Phase 1: delegation match — DB-level JSONB path comparison (exact, no app-level loop)
    if (delegationKind && delegationKey) {
      const [match] = await db
        .select()
        .from(issueTable)
        .where(
          and(
            eq(issueTable.companyId, args.companyId),
            eq(issueTable.parentId, args.parentId),
            notInArray(issueTable.status, terminalStatuses),
            sql`lower(${issueTable.delegation}->>'kind') = ${delegationKind}`,
            sql`lower(${issueTable.delegation}->>'key') = ${delegationKey}`,
          ),
        )
        .limit(1);
      if (match) return match;
    }

    // Phase 2: title match — DB-level lower+trim (fallback when delegation absent)
    const normalizedTitle = args.title.trim().toLowerCase();
    if (normalizedTitle) {
      const [match] = await db
        .select()
        .from(issueTable)
        .where(
          and(
            eq(issueTable.companyId, args.companyId),
            eq(issueTable.parentId, args.parentId),
            notInArray(issueTable.status, terminalStatuses),
            sql`lower(trim(${issueTable.title})) = ${normalizedTitle}`,
          ),
        )
        .limit(1);
      if (match) return match;
    }

    return null;
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
    const parentAdvance = await workflowOrchestrator.advanceParentAfterChildReviewCompletion({
      completedIssueId: issue.id,
      previousStatus: existing.status,
      nextStatus: issue.status,
      actorType: actor.actorType,
      actorAgentId: actor.agentId,
      companyId: issue.companyId,
    });
    if (!parentAdvance) return;
    const { parentIssue, updatedParent, parentPatch, summary } = parentAdvance;

    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(parentPatch)) {
      if (
        key in parentIssue &&
        (parentIssue as Record<string, unknown>)[key] !==
          (parentPatch as Record<string, unknown>)[key]
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
    issue: {
      id: string;
      companyId: string;
      status: string;
      assigneeAgentId: string | null;
      workflowEpoch?: number | null;
    },
  ) {
    if (req.actor.type !== "agent") return true;
    const actorAgentId = req.actor.agentId;
    if (!actorAgentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    const workflowAuthority = await workflowOrchestrator.evaluateAgentMutationAuthority({
      issueId: issue.id,
      companyId: issue.companyId,
      actorAgentId,
    });
    if (!workflowAuthority.allowed && workflowAuthority.reason === "workflow_advanced") {
      res.status(409).json({
        error: workflowAuthority.message,
      });
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
              recoveryStatus: executionWorkspace.recoveryStatus,
              recoveryReason: executionWorkspace.recoveryReason,
              recoveryRequestedAt: executionWorkspace.recoveryRequestedAt,
              recoveryStartedAt: executionWorkspace.recoveryStartedAt,
              recoveryFinishedAt: executionWorkspace.recoveryFinishedAt,
              recoveryAttemptCount: executionWorkspace.recoveryAttemptCount ?? 0,
              lastRecoveryRunId: executionWorkspace.lastRecoveryRunId,
              recoveryContext: executionWorkspace.recoveryContext,
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

  router.get("/issues/:id/workflow-sessions", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const sessions = await workflowSessionsSvc.listForIssue(id);
    res.json(sessions);
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
      await workflowOrchestrator.assertIssueExecutionAllowed({
        issueId: req.body.parentId,
        companyId,
        reason: "subtask",
      });
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
      let patchResult: Awaited<ReturnType<typeof workflowOrchestrator.applyWorkflowAwareIssuePatch>> | null = null;
      try {
        patchResult = await workflowOrchestrator.applyWorkflowAwareIssuePatch({
          issueId: existing.id,
          companyId: existing.companyId,
          actorType: req.actor.type,
          actorAgentId: req.actor.type === "agent" ? req.actor.agentId : null,
          requestedPatch: updateFields,
          assertCanAssign: async () => {
            await assertCanAssignTasks(req, existing.companyId);
          },
          assertParentPlanApprovedBeforeDelegation: async () => {
            if (typeof existing.parentId !== "string" || existing.parentId.length === 0) return;
            await assertParentPlanApprovedBeforeDelegation({
              parentIssueId: existing.parentId,
              actor,
              source: "assignee_change",
            });
          },
          assertAgentMutationAuthority: async () => {
            if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) {
              throw conflict("Agent mutation blocked");
            }
          },
          afterUpdate: async (updatedIssue, context) => {
            if (!updatedIssue) return;
            await maybeCreateBoardReviewApproval({
              issue: updatedIssue,
              existing,
              actor,
              commentBody,
              isAgentReturningIssueToCreator: context.isAgentReturningIssueToCreator,
              delegations: requestDelegations,
            });
          },
        });
        updateFields = patchResult.updateFields;
        assigneeWillChange = patchResult.assigneeWillChange;
        isAgentReturningIssueToCreator = patchResult.isAgentReturningIssueToCreator;
        if (!patchResult.issue) {
          res.status(404).json({ error: "Issue not found" });
          return;
        }
        issue = patchResult.issue;
      } catch (err) {
        if (err instanceof HttpError && err.status === 409 && err.message === "Agent mutation blocked") {
          return;
        }
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
              requestedAssigneeWillChange: patchResult?.requestedAssigneeWillChange,
              error: err.message,
              details: err.details,
            },
            "issue update rejected with 422",
          );
        }
        if (isAgentReturningIssueToCreator && err instanceof Error) {
          logger.warn(
            { issueId: id, error: err.message },
            "approval creation failed after issue update — rolling back status to in_progress",
          );
        }
        throw err;
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
        details: {
          ...updateFields,
          identifier: issue.identifier,
          _previous: patchResult && Object.keys(patchResult.previous).length > 0 ? patchResult.previous : undefined,
        },
      });

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

    await workflowOrchestrator.assertIssueExecutionAllowed({
      issueId: issue.id,
      companyId: issue.companyId,
      reason: "checkout",
    });
    await workflowOrchestrator.assertAncestorExecutionAllowed({
      issueId: issue.id,
      companyId: issue.companyId,
      reason: "checkout",
    });
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
