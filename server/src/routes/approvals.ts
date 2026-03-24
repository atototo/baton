import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { heartbeatRuns, issues as issueTable, type Db } from "@atototo/db";
import {
  addApprovalCommentSchema,
  createApprovalSchema,
  requestApprovalRevisionSchema,
  resolveApprovalSchema,
  resubmitApprovalSchema,
} from "@atototo/shared";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import {
  approvalService,
  buildExecutionWorkspacePlanForIssue,
  executionWorkspaceService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  parseExecutionWorkspacePlan,
  projectService,
  pullRequestService,
  secretService,
} from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { conflict } from "../errors.js";
import { redactEventPayload } from "../redaction.js";

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(approval: T): T {
  return {
    ...approval,
    payload: redactEventPayload(approval.payload) ?? {},
  };
}

function buildPullRequestTitle(args: {
  issueIdentifier: string | null;
  issueTitle: string;
  changedPaths: string[];
}) {
  const { issueIdentifier, issueTitle, changedPaths } = args;
  const hasBackendReadme = changedPaths.includes("backend/README.md");
  const hasFrontendReadme = changedPaths.includes("frontend/README.md");
  const prefix = issueIdentifier ? `${issueIdentifier}: ` : "";

  if (hasBackendReadme && hasFrontendReadme) {
    return `${prefix}add backend and frontend README documentation`;
  }
  if (hasBackendReadme) {
    return `${prefix}add backend README documentation`;
  }
  if (hasFrontendReadme) {
    return `${prefix}add frontend README documentation`;
  }
  return `${prefix}${issueTitle}`;
}

function buildPullRequestBody(args: {
  issueIdentifier: string | null;
  ticketKey: string;
  branch: string;
  baseBranch: string;
  changedPaths: string[];
  childIssues: Array<{ identifier: string | null; title: string }>;
}) {
  const { issueIdentifier, ticketKey, branch, baseBranch, changedPaths, childIssues } = args;
  const summaryLines =
    changedPaths.length > 0
      ? changedPaths.map((path) => `- Add or update \`${path}\``)
      : [`- Finalize the approved work for ${issueIdentifier ?? ticketKey}`];
  const childLines =
    childIssues.length > 0
      ? childIssues.map((child) => `- ${child.identifier ?? child.title}: ${child.title}`)
      : ["- Child issue review completed in Baton"];
  const validationLines = [
    "- Baton child issues completed and reviewed",
    `- Branch prepared for merge from \`${branch}\` into \`${baseBranch}\``,
  ];
  const contextLines = [
    `- Parent issue: ${issueIdentifier ?? "(unknown)"}`,
    `- Ticket: ${ticketKey}`,
    `- Branch: ${branch}`,
  ];

  return [
    "## Summary",
    ...summaryLines,
    "",
    "## Included Work",
    ...childLines,
    "",
    "## Files Changed",
    ...(changedPaths.length > 0 ? changedPaths.map((path) => `- \`${path}\``) : ["- (no tracked file list available)"]),
    "",
    "## Validation",
    ...validationLines,
    "",
    "## Baton Context",
    ...contextLines,
  ].join("\n");
}

export function approvalRoutes(db: Db) {
  const router = Router();
  const svc = approvalService(db);
  const heartbeat = heartbeatService(db);
  const executionWorkspacesSvc = executionWorkspaceService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const issuesSvc = issueService(db);
  const projectsSvc = projectService(db);
  const pullRequestsSvc = pullRequestService();
  const secretsSvc = secretService(db);
  const strictSecretsMode = process.env.BATON_SECRETS_STRICT_MODE === "true";

  async function resolveApprovalPrimaryIssue(
    companyId: string,
    payload: Record<string, unknown>,
    issueIds: string[],
    actorRunId: string | null,
  ) {
    const payloadIssueIds = Array.isArray(payload.issueIds)
      ? payload.issueIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const explicitIssueIds = Array.from(new Set([...issueIds, ...payloadIssueIds]));

    const explicitIssues = [];
    for (const issueId of explicitIssueIds) {
      const issue = await issuesSvc.getById(issueId);
      if (!issue || issue.companyId !== companyId) {
        throw conflict(`Linked issue not found: ${issueId}`);
      }
      explicitIssues.push(issue);
    }

    const payloadIssueId =
      typeof payload.issueId === "string" && payload.issueId.trim().length > 0 ? payload.issueId.trim() : null;
    const payloadIssueIdentifier =
      typeof payload.issueIdentifier === "string" && payload.issueIdentifier.trim().length > 0
        ? payload.issueIdentifier.trim()
        : null;

    let payloadIssue = null;
    if (payloadIssueId) {
      payloadIssue = await issuesSvc.getById(payloadIssueId);
    } else if (payloadIssueIdentifier) {
      payloadIssue = await issuesSvc.getByIdentifier(payloadIssueIdentifier);
    }

    if (payloadIssue && payloadIssue.companyId !== companyId) {
      throw conflict("Approval payload issue must belong to the same company");
    }

    if ((payloadIssueId || payloadIssueIdentifier) && !payloadIssue) {
      throw conflict("Approval payload references an issue that was not found");
    }

    const linkedIssues = [...explicitIssues];
    if (payloadIssue && !linkedIssues.some((issue) => issue.id === payloadIssue.id)) {
      linkedIssues.push(payloadIssue);
    }

    if (linkedIssues.length === 0 && actorRunId) {
      const runContext = await db
        .select({ contextSnapshot: heartbeatRuns.contextSnapshot })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), eq(heartbeatRuns.id, actorRunId)))
        .then((rows) => rows[0] ?? null);
      const runIssueId =
        runContext &&
        typeof runContext.contextSnapshot === "object" &&
        runContext.contextSnapshot !== null &&
        !Array.isArray(runContext.contextSnapshot) &&
        typeof (runContext.contextSnapshot as Record<string, unknown>).issueId === "string"
          ? ((runContext.contextSnapshot as Record<string, unknown>).issueId as string).trim()
          : "";

      if (runIssueId) {
        const runIssue = await issuesSvc.getById(runIssueId);
        if (runIssue && runIssue.companyId === companyId) {
          linkedIssues.push(runIssue);
        }
      }
    }

    return {
      linkedIssues,
      uniqueIssueIds: Array.from(new Set(linkedIssues.map((issue) => issue.id))),
      primaryIssue: linkedIssues[0] ?? null,
    };
  }

  router.get("/companies/:companyId/approvals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = req.query.status as string | undefined;
    const result = await svc.list(companyId, status);
    res.json(result.map((approval) => redactApprovalPayload(approval)));
  });

  router.get("/approvals/:id", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    res.json(redactApprovalPayload(approval));
  });

  router.post("/companies/:companyId/approvals", validate(createApprovalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rawIssueIds = req.body.issueIds;
    const issueIds = Array.isArray(rawIssueIds)
      ? rawIssueIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const { issueIds: _issueIds, ...approvalInput } = req.body;
    const actor = getActorInfo(req);
    const normalizedPayload =
      approvalInput.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            companyId,
            approvalInput.payload,
            { strictMode: strictSecretsMode },
          )
        : approvalInput.payload;
    const {
      linkedIssues,
      uniqueIssueIds,
      primaryIssue,
    } = await resolveApprovalPrimaryIssue(companyId, normalizedPayload, issueIds, actor.runId);
    let enrichedPayload = normalizedPayload;
    if (approvalInput.type === "approve_issue_plan" && primaryIssue) {
      const existingWorkspacePlan = parseExecutionWorkspacePlan(normalizedPayload);
      if (!existingWorkspacePlan) {
        if (!primaryIssue.projectId) {
          throw conflict("Issue plan approval requires a linked project issue.");
        }
        const projectWorkspaces = await projectsSvc.listWorkspaces(primaryIssue.projectId);
        const workspacePlan = buildExecutionWorkspacePlanForIssue({
          issue: primaryIssue,
          projectWorkspaces,
        });
        enrichedPayload = {
          ...normalizedPayload,
          issueId: typeof normalizedPayload.issueId === "string" ? normalizedPayload.issueId : primaryIssue.id,
          title: typeof normalizedPayload.title === "string" ? normalizedPayload.title : primaryIssue.title,
          issueIdentifier:
            typeof normalizedPayload.issueIdentifier === "string"
              ? normalizedPayload.issueIdentifier
              : primaryIssue.identifier,
          description:
            typeof normalizedPayload.description === "string"
              ? normalizedPayload.description
              : primaryIssue.description,
          workspace: workspacePlan,
        };
      }
    }

    if (
      primaryIssue &&
      (approvalInput.type === "approve_issue_plan" || approvalInput.type === "approve_pull_request")
    ) {
      const existingApproval = await svc.findActionableForIssue({
        companyId,
        type: approvalInput.type,
        issueId: primaryIssue.id,
        issueIdentifier: primaryIssue.identifier,
      });
      if (existingApproval) {
        let responseApproval = existingApproval;
        if (
          approvalInput.type === "approve_issue_plan" &&
          !parseExecutionWorkspacePlan(existingApproval.payload)
        ) {
          responseApproval =
            (await svc.updatePayload(existingApproval.id, {
              ...existingApproval.payload,
              ...enrichedPayload,
            })) ?? existingApproval;
        }

        if (uniqueIssueIds.length > 0) {
          await issueApprovalsSvc.linkManyForApproval(responseApproval.id, uniqueIssueIds, {
            agentId: actor.agentId,
            userId: actor.actorType === "user" ? actor.actorId : null,
          });
        }

        res.status(200).json(redactApprovalPayload(responseApproval));
        return;
      }
    }

    const approval = await svc.create(companyId, {
      ...approvalInput,
      payload: enrichedPayload,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      requestedByAgentId:
        approvalInput.requestedByAgentId ?? (actor.actorType === "agent" ? actor.actorId : null),
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    if (uniqueIssueIds.length > 0) {
      await issueApprovalsSvc.linkManyForApproval(approval.id, uniqueIssueIds, {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      });

      if (approval.type === "approve_issue_plan") {
        for (const issue of linkedIssues) {
          if (issue.status !== "todo" && issue.status !== "in_progress") continue;
          const blockedIssue = await issuesSvc.update(issue.id, { status: "blocked" });
          if (!blockedIssue) continue;

          await logActivity(db, {
            companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "issue.blocked_for_approval",
            entityType: "issue",
            entityId: issue.id,
            details: {
              approvalId: approval.id,
              approvalType: approval.type,
              previousStatus: issue.status,
              nextStatus: blockedIssue.status,
              source: "approval.create",
            },
          });
        }
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: uniqueIssueIds },
    });

    res.status(201).json(redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/issues", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const issues = await issueApprovalsSvc.listIssuesForApproval(id);
    res.json(issues);
  });

  router.post("/approvals/:id/approve", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existingApproval = await svc.getById(id);
    if (!existingApproval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    if (existingApproval.status !== "pending" && existingApproval.status !== "revision_requested") {
      res.status(422).json({ error: "Only pending or revision requested approvals can be approved" });
      return;
    }

    const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(existingApproval.id);
    const linkedIssueIds = linkedIssues.map((issue) => issue.id);
    const primaryIssueId = linkedIssueIds[0] ?? null;
    const workspacePlan =
      existingApproval.type === "approve_issue_plan"
        ? parseExecutionWorkspacePlan(existingApproval.payload)
        : null;
    // workspace is optional for issue plans — analysis/research plans
    // may only create child issues without provisioning a branch.

    const provisionedWorkspace =
      existingApproval.type === "approve_issue_plan" && workspacePlan
        ? await executionWorkspacesSvc.provisionExecutionWorkspace({
            companyId: existingApproval.companyId,
            plan: workspacePlan,
          })
        : null;

    const primaryIssue =
      primaryIssueId != null
        ? await issuesSvc.getById(primaryIssueId)
        : null;
    if (existingApproval.type === "approve_pull_request" && !primaryIssue) {
      res.status(422).json({ error: "Pull request approval must be linked to a parent issue" });
      return;
    }

    if (existingApproval.type === "approve_pull_request" && !primaryIssue?.executionWorkspaceId) {
      res.status(422).json({ error: "Pull request approval requires a linked execution workspace" });
      return;
    }

    const pullRequestResult =
      existingApproval.type === "approve_pull_request" && primaryIssue?.executionWorkspaceId
        ? await (async () => {
            const executionWorkspace = await executionWorkspacesSvc.getById(primaryIssue.executionWorkspaceId!);
            if (!executionWorkspace) {
              throw conflict("Pull request approval requires a linked execution workspace.");
            }

            const projectWorkspaces = primaryIssue.projectId
              ? await projectsSvc.listWorkspaces(primaryIssue.projectId)
              : [];
            const linkedProjectWorkspace =
              projectWorkspaces.find((workspace) => workspace.id === executionWorkspace.projectWorkspaceId) ?? null;

            const payload = existingApproval.payload;
            const pullRequestBranch =
              typeof payload.branch === "string" && payload.branch.trim().length > 0
                ? payload.branch
                : executionWorkspace.branch;
            const pullRequestBaseBranch =
              typeof payload.baseBranch === "string" && payload.baseBranch.trim().length > 0
                ? payload.baseBranch
                : executionWorkspace.baseBranch;
            const changedPaths = (await pullRequestsSvc.summarizeWorkingTreeChanges(executionWorkspace.executionCwd)).paths;
            const childIssues = await db
              .select({
                identifier: issueTable.identifier,
                title: issueTable.title,
              })
              .from(issueTable)
              .where(and(eq(issueTable.companyId, primaryIssue.companyId), eq(issueTable.parentId, primaryIssue.id)));
            const pullRequestTitle = buildPullRequestTitle({
              issueIdentifier: primaryIssue.identifier,
              issueTitle: primaryIssue.title,
              changedPaths,
            });
            const pullRequestBody = buildPullRequestBody({
              issueIdentifier: primaryIssue.identifier,
              ticketKey: executionWorkspace.ticketKey,
              branch: pullRequestBranch,
              baseBranch: pullRequestBaseBranch,
              changedPaths,
              childIssues,
            });

            return pullRequestsSvc.openForExecutionWorkspace({
              cwd: executionWorkspace.executionCwd,
              preferredRepoUrl: linkedProjectWorkspace?.repoUrl ?? null,
              title: pullRequestTitle,
              body: pullRequestBody,
              branch: pullRequestBranch,
              baseBranch: pullRequestBaseBranch,
              commitMessage: `${primaryIssue.identifier ?? executionWorkspace.ticketKey}: ${primaryIssue.title}`,
            });
          })()
        : null;

    let approval = await svc.approve(id, req.body.decidedByUserId ?? "board", req.body.decisionNote);

    if (approval.type === "approve_pull_request" && pullRequestResult) {
      const payload = {
        ...approval.payload,
        branch: pullRequestResult.branch,
        baseBranch: pullRequestResult.baseBranch,
        repository: pullRequestResult.repository,
        repoUrl: pullRequestResult.repoUrl,
        pullRequestUrl: pullRequestResult.pullRequestUrl,
        pullRequestNumber: pullRequestResult.pullRequestNumber,
        commitSha: pullRequestResult.commitSha,
      };
      const updatedApproval = await svc.updatePayload(approval.id, payload);
      if (updatedApproval) approval = updatedApproval;

      for (const linkedIssue of linkedIssues) {
        if (linkedIssue.status === "done" || linkedIssue.status === "cancelled") continue;

        const completedIssue = await issuesSvc.update(linkedIssue.id, { status: "done" });
        if (!completedIssue) continue;

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.completed_after_pull_request_approval",
          entityType: "issue",
          entityId: linkedIssue.id,
          details: {
            approvalId: approval.id,
            approvalType: approval.type,
            previousStatus: linkedIssue.status,
            nextStatus: completedIssue.status,
            pullRequestUrl: pullRequestResult.pullRequestUrl,
            pullRequestNumber: pullRequestResult.pullRequestNumber,
          },
        });

        const comment = await issuesSvc.addComment(
          linkedIssue.id,
          `## PR 생성 및 승인 완료\n\n` +
            `실제 PR 생성까지 완료되었습니다. parent issue를 종료합니다.\n\n` +
            `- 저장소: ${pullRequestResult.repository}\n` +
            `- 브랜치: \`${pullRequestResult.branch}\`\n` +
            `- 베이스: \`${pullRequestResult.baseBranch}\`\n` +
            `- PR: ${pullRequestResult.pullRequestUrl}\n` +
            (pullRequestResult.commitSha ? `- 커밋: \`${pullRequestResult.commitSha}\`\n` : ""),
          { userId: req.actor.userId ?? "board" },
        );

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.comment_added",
          entityType: "issue",
          entityId: linkedIssue.id,
          details: {
            commentId: comment.id,
            bodySnippet: comment.body.slice(0, 120),
            identifier: linkedIssue.identifier,
            issueTitle: linkedIssue.title,
          },
        });
      }

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "pull_request.created",
        entityType: "approval",
        entityId: approval.id,
        details: {
          issueId: primaryIssueId,
          repository: pullRequestResult.repository,
          repoUrl: pullRequestResult.repoUrl,
          branch: pullRequestResult.branch,
          baseBranch: pullRequestResult.baseBranch,
          pullRequestUrl: pullRequestResult.pullRequestUrl,
          pullRequestNumber: pullRequestResult.pullRequestNumber,
          commitSha: pullRequestResult.commitSha,
        },
      });
    }

    if (approval.type === "approve_issue_plan" && provisionedWorkspace) {
      const issueIdsToAttach = Array.from(
        new Set([
          ...linkedIssueIds,
          ...(workspacePlan?.ownerIssueId ? [workspacePlan.ownerIssueId] : []),
        ]),
      );

      for (const issueId of issueIdsToAttach) {
        const updatedIssue = await issuesSvc.update(issueId, {
          executionWorkspaceId: provisionedWorkspace.id,
        });
        if (!updatedIssue) continue;

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.execution_workspace_linked",
          entityType: "issue",
          entityId: issueId,
          details: {
            approvalId: approval.id,
            executionWorkspaceId: provisionedWorkspace.id,
            ticketKey: provisionedWorkspace.ticketKey,
            branch: provisionedWorkspace.branch,
          },
        });
      }

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "execution_workspace.provisioned",
        entityType: "execution_workspace",
        entityId: provisionedWorkspace.id,
        details: {
          approvalId: approval.id,
          ownerIssueId: workspacePlan?.ownerIssueId ?? null,
          ticketKey: provisionedWorkspace.ticketKey,
          branch: provisionedWorkspace.branch,
          baseBranch: provisionedWorkspace.baseBranch,
        },
      });

    }

    // Resume blocked issues after plan approval — applies regardless of workspace
    if (approval.type === "approve_issue_plan") {
      for (const linkedIssue of linkedIssues) {
        const shouldResumeBlockedParent =
          linkedIssue.status === "blocked" &&
          linkedIssue.assigneeAgentId != null &&
          linkedIssue.assigneeAgentId === approval.requestedByAgentId;
        if (!shouldResumeBlockedParent) continue;

        const resumedIssue = await issuesSvc.update(linkedIssue.id, { status: "in_progress" });
        if (!resumedIssue) continue;

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.resumed_after_approval",
          entityType: "issue",
          entityId: linkedIssue.id,
          details: {
            approvalId: approval.id,
            approvalType: approval.type,
            previousStatus: linkedIssue.status,
            nextStatus: resumedIssue.status,
          },
        });
      }
    }

    // Complete linked issues when approve_completion is approved (no PR needed)
    if (approval.type === "approve_completion") {
      for (const linkedIssue of linkedIssues) {
        if (linkedIssue.status === "done" || linkedIssue.status === "cancelled") continue;

        const completedIssue = await issuesSvc.update(linkedIssue.id, { status: "done" });
        if (!completedIssue) continue;

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.completed_after_completion_approval",
          entityType: "issue",
          entityId: linkedIssue.id,
          details: {
            approvalId: approval.id,
            approvalType: approval.type,
            previousStatus: linkedIssue.status,
            nextStatus: completedIssue.status,
          },
        });

        const comment = await issuesSvc.addComment(
          linkedIssue.id,
          `## 완료 승인\n\n보드에서 완료 승인되었습니다. PR 없이 이슈를 종료합니다.`,
          { userId: req.actor.userId ?? "board" },
        );

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "issue.comment_added",
          entityType: "issue",
          entityId: linkedIssue.id,
          details: {
            commentId: comment.id,
            bodySnippet: comment.body.slice(0, 120),
            identifier: linkedIssue.identifier,
            issueTitle: linkedIssue.title,
          },
        });
      }
    }

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "approval.approved",
      entityType: "approval",
      entityId: approval.id,
      details: {
        type: approval.type,
        requestedByAgentId: approval.requestedByAgentId,
        linkedIssueIds,
      },
    });

    if (approval.requestedByAgentId) {
      try {
        const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
          source: "automation",
          triggerDetail: "system",
          reason: "approval_approved",
          payload: {
            approvalId: approval.id,
            approvalStatus: approval.status,
            issueId: primaryIssueId,
            issueIds: linkedIssueIds,
            hasExecutionWorkspace: provisionedWorkspace != null,
            executionWorkspaceId: provisionedWorkspace?.id ?? null,
          },
          requestedByActorType: "user",
          requestedByActorId: req.actor.userId ?? "board",
          contextSnapshot: {
            source: "approval.approved",
            approvalId: approval.id,
            approvalStatus: approval.status,
            issueId: primaryIssueId,
            issueIds: linkedIssueIds,
            taskId: primaryIssueId,
            wakeReason: "approval_approved",
          },
        });

        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "approval.requester_wakeup_queued",
          entityType: "approval",
          entityId: approval.id,
          details: {
            requesterAgentId: approval.requestedByAgentId,
            wakeRunId: wakeRun?.id ?? null,
            linkedIssueIds,
          },
        });
      } catch (err) {
        logger.warn(
          {
            err,
            approvalId: approval.id,
            requestedByAgentId: approval.requestedByAgentId,
          },
          "failed to queue requester wakeup after approval",
        );
        await logActivity(db, {
          companyId: approval.companyId,
          actorType: "user",
          actorId: req.actor.userId ?? "board",
          action: "approval.requester_wakeup_failed",
          entityType: "approval",
          entityId: approval.id,
          details: {
            requesterAgentId: approval.requestedByAgentId,
            linkedIssueIds,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    res.json(redactApprovalPayload(approval));
  });

  router.post("/approvals/:id/reject", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const approval = await svc.reject(id, req.body.decidedByUserId ?? "board", req.body.decisionNote);

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "approval.rejected",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type },
    });

    // Post rejection reason as comment on linked issues and wake agent
    const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(id);
    const note = req.body.decisionNote || "승인이 거절되었습니다.";
    for (const linked of linkedIssues) {
      await issuesSvc.addComment(
        linked.id,
        `**거절** (${approval.type})\n\n${note}`,
        { userId: req.actor.userId ?? "board" },
      );

      // Unblock issue so agent can reassess
      const issue = await issuesSvc.getById(linked.id);
      if (issue && issue.status === "blocked") {
        await issuesSvc.update(linked.id, { status: "in_progress" });
      }
    }

    if (approval.requestedByAgentId) {
      await heartbeat.wakeup(approval.requestedByAgentId, {
        source: "automation",
        reason: "approval_rejected",
        payload: {
          approvalId: approval.id,
          approvalType: approval.type,
          decisionNote: note,
        },
      });
    }

    res.json(redactApprovalPayload(approval));
  });

  router.post(
    "/approvals/:id/request-revision",
    validate(requestApprovalRevisionSchema),
    async (req, res) => {
      assertBoard(req);
      const id = req.params.id as string;
      const approval = await svc.requestRevision(
        id,
        req.body.decidedByUserId ?? "board",
        req.body.decisionNote,
      );

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.revision_requested",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type },
      });

      // Post revision feedback as comment on linked issue and wake the requesting agent
      const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(id);
      const note = req.body.decisionNote || "수정이 필요합니다.";
      for (const linked of linkedIssues) {
        await issuesSvc.addComment(
          linked.id,
          `**수정 요청** (${approval.type})\n\n${note}`,
          { userId: req.actor.userId ?? "board" },
        );

        // Resume blocked issue so the agent can rework it
        const issue = await issuesSvc.getById(linked.id);
        if (issue && issue.status === "blocked") {
          await issuesSvc.update(linked.id, { status: "in_progress" });
        }
      }

      // Wake requesting agent so it can act on the revision feedback
      if (approval.requestedByAgentId) {
        await heartbeat.wakeup(approval.requestedByAgentId, {
          source: "automation",
          reason: "approval_revision_requested",
          payload: {
            approvalId: approval.id,
            approvalType: approval.type,
            decisionNote: note,
          },
        });
      }

      res.json(redactApprovalPayload(approval));
    },
  );

  router.post("/approvals/:id/resubmit", validate(resubmitApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== existing.requestedByAgentId) {
      res.status(403).json({ error: "Only requesting agent can resubmit this approval" });
      return;
    }

    const normalizedPayload = req.body.payload
      ? existing.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            existing.companyId,
            req.body.payload,
            { strictMode: strictSecretsMode },
          )
        : req.body.payload
      : undefined;
    const approval = await svc.resubmit(id, normalizedPayload);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.resubmitted",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type },
    });
    res.json(redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const comments = await svc.listComments(id);
    res.json(comments);
  });

  router.post("/approvals/:id/comments", validate(addApprovalCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const actor = getActorInfo(req);
    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.comment_added",
      entityType: "approval",
      entityId: approval.id,
      details: { commentId: comment.id },
    });

    res.status(201).json(comment);
  });

  return router;
}
