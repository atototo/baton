import { Router } from "express";
import { and, eq, not, inArray } from "drizzle-orm";
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
  buildExecutionWorkspacePlansForDelegations,
  executionWorkspaceService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  parseDelegationPlan,
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

/**
 * Strip Baton-internal issue references (e.g. "(DOB-115)", "[DOB-116]", "DOB-115")
 * from text destined for external systems like GitHub PRs.
 * Preserves the surrounding text structure.
 */
function stripBatonIssueRefs(text: string, identifiers: string[]): string {
  if (identifiers.length === 0) return text;
  // Escape identifiers for regex and remove them in common wrapper patterns:
  //   (DOB-115)  [DOB-115]  DOB-115  /DOB/issues/DOB-115
  for (const id of identifiers) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Remove markdown links like [DOB-115](/DOB/issues/DOB-115)
    text = text.replace(new RegExp(`\\[${escaped}\\]\\([^)]*\\)`, "g"), "");
    // Remove parenthesized/bracketed references
    text = text.replace(new RegExp(`\\s*[\\(\\[]${escaped}[\\)\\]]`, "g"), "");
    // Remove standalone references (preceded by whitespace or start)
    text = text.replace(new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$|[,;.])`, "gm"), "");
  }
  // Clean up leftover empty list items and blank lines
  text = text.replace(/^-\s*$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function buildPullRequestBody(args: {
  issueIdentifier: string | null;
  issueTitle: string;
  issueDescription: string | null;
  ticketKey: string;
  branch: string;
  baseBranch: string;
  changedPaths: string[];
  childIssues: Array<{ identifier: string | null; title: string }>;
  approvalSummary?: string | null;
}) {
  const { issueTitle, issueDescription, ticketKey, changedPaths, childIssues, approvalSummary } = args;

  // Collect all Baton identifiers to strip from PR body
  const batonIdentifiers = childIssues
    .map((c) => c.identifier)
    .filter((id): id is string => id != null);
  if (args.issueIdentifier) batonIdentifiers.push(args.issueIdentifier);

  const sections: string[] = [];

  // Summary — always start with issue title for context
  sections.push("## Summary");
  sections.push(issueTitle);

  // Include approval summary if it contains substantive content (not just status messages)
  const statusPatterns = /^(리뷰 완료|보드 승인|PR 승인|작업 완료|구현 완료)/;
  if (approvalSummary && !statusPatterns.test(approvalSummary.trim())) {
    sections.push("", stripBatonIssueRefs(approvalSummary, batonIdentifiers));
  }

  // Child issues as work items (always include if available)
  if (childIssues.length > 0) {
    sections.push("", "### Work Items");
    for (const child of childIssues) {
      sections.push(`- ${stripBatonIssueRefs(child.title, batonIdentifiers)}`);
    }
  }

  // Extract structured requirements from issue description (numbered lists, bullet points)
  if (issueDescription) {
    const cleanDesc = stripBatonIssueRefs(issueDescription, batonIdentifiers);
    // Extract lines that look like requirements (numbered items or bullet points)
    const requirementLines = cleanDesc
      .split("\n")
      .filter((line) => /^\s*(\d+\.|[-*])\s+/.test(line))
      .map((line) => line.trim());
    if (requirementLines.length > 0) {
      sections.push("", "### Requirements");
      for (const line of requirementLines) {
        sections.push(line);
      }
    }
  }

  // Changed files
  if (changedPaths.length > 0) {
    sections.push("", "## Changes");
    for (const path of changedPaths) {
      sections.push(`- \`${path}\``);
    }
  }

  // Ticket reference (minimal, non-Baton)
  sections.push("", `---`, `Ticket: ${ticketKey}`);

  return sections.join("\n");
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
      const existingDelegations = parseDelegationPlan(normalizedPayload);

      // Multi-workspace project: validate and correct workspace selection
      if (primaryIssue.projectId) {
        const projectWorkspaces = await projectsSvc.listWorkspaces(primaryIssue.projectId);
        console.log(`[approve_issue_plan] projectId=${primaryIssue.projectId} workspaces=${projectWorkspaces.length} hasDelegations=${!!existingDelegations} hasWorkspacePlan=${!!existingWorkspacePlan}`);

        // If delegations provided, rebuild workspace plan from delegations (overrides any manually-set workspace)
        if (existingDelegations && existingDelegations.length > 0) {
          const plans = buildExecutionWorkspacePlansForDelegations({
            issue: primaryIssue,
            delegations: existingDelegations,
            projectWorkspaces,
          });
          const firstPlan = plans.values().next().value;
          if (firstPlan) {
            enrichedPayload = {
              ...normalizedPayload,
              workspace: firstPlan,
            };
          }
        } else if (projectWorkspaces.length > 1 && existingWorkspacePlan) {
          // Agent set workspace directly without delegations — infer correct workspace from issue content
          const inferred = buildExecutionWorkspacePlanForIssue({
            issue: primaryIssue,
            projectWorkspaces,
          });
          if (inferred.projectWorkspaceId !== existingWorkspacePlan.projectWorkspaceId) {
            console.log(
              `[approve_issue_plan] Workspace corrected: agent sent "${existingWorkspacePlan.projectWorkspaceName}" but issue content matches "${inferred.projectWorkspaceName}"`,
            );
          }
          enrichedPayload = {
            ...normalizedPayload,
            workspace: inferred,
          };
        }
      }

      if (!existingWorkspacePlan && !existingDelegations?.length) {
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

    if (approvalInput.type === "approve_pull_request" && primaryIssue) {
      if (!primaryIssue.executionWorkspaceId) {
        throw conflict("Pull request approval requires a linked execution workspace.");
      }

      const executionWorkspace = await executionWorkspacesSvc.getById(primaryIssue.executionWorkspaceId);
      if (!executionWorkspace) {
        throw conflict("Pull request approval requires a linked execution workspace.");
      }

      const pullRequestBranch =
        typeof normalizedPayload.branch === "string" && normalizedPayload.branch.trim().length > 0
          ? normalizedPayload.branch.trim()
          : executionWorkspace.branch;
      const pullRequestBaseBranch =
        typeof normalizedPayload.baseBranch === "string" && normalizedPayload.baseBranch.trim().length > 0
          ? normalizedPayload.baseBranch.trim()
          : executionWorkspace.baseBranch;

      const syncStartedAt = new Date();
      await executionWorkspacesSvc.updateSyncState(executionWorkspace.id, {
        syncStatus: "syncing",
        syncMethod: "merge",
        lastPrCheckedAt: syncStartedAt,
        conflictSummary: null,
        escalationSummary: null,
      });

      const preparation = await pullRequestsSvc.prepareForPullRequest({
        cwd: executionWorkspace.executionCwd,
        branch: pullRequestBranch,
        baseBranch: pullRequestBaseBranch,
      });

      const syncCompletedAt = new Date();
      await executionWorkspacesSvc.updateSyncState(executionWorkspace.id, {
        syncStatus: preparation.syncStatus,
        syncMethod: "merge",
        lastSyncedAt: syncCompletedAt,
        lastPrCheckedAt: syncCompletedAt,
        lastVerifiedAt: preparation.syncStatus === "verified" ? syncCompletedAt : null,
        lastBaseCommitSha: preparation.baseCommitSha,
        lastBranchCommitSha: preparation.branchCommitSha,
        conflictSummary: (preparation.conflictSummary as Record<string, unknown> | null) ?? null,
        escalationSummary:
          preparation.syncStatus === "conflicted"
            ? "Baton could not synchronize the execution branch with the latest base branch."
            : null,
      });

      if (preparation.syncStatus === "conflicted") {
        await heartbeat.queueExecutionWorkspaceRecovery({
          executionWorkspaceId: executionWorkspace.id,
          issueId: primaryIssue.id,
          reason: "pre_pr_conflict",
          conflictSummary: (preparation.conflictSummary as Record<string, unknown> | null) ?? null,
          actorId: actor.actorId,
        });
        throw conflict("Pull request branch sync conflict detected.", preparation.conflictSummary ?? undefined);
      }

      enrichedPayload = {
        ...normalizedPayload,
        branch: preparation.branch,
        baseBranch: preparation.baseBranch,
        syncStatus: preparation.syncStatus,
        syncMethod: "merge",
        lastBaseCommitSha: preparation.baseCommitSha,
        lastBranchCommitSha: preparation.branchCommitSha,
        changedPaths: preparation.changedPaths,
        conflictSummary: preparation.conflictSummary,
        mergeabilityCheckedAt: syncCompletedAt.toISOString(),
      };
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
    const delegations =
      existingApproval.type === "approve_issue_plan"
        ? parseDelegationPlan(existingApproval.payload)
        : null;
    // workspace is optional for issue plans — analysis/research plans
    // may only create child issues without provisioning a branch.

    // Provision workspace(s): delegation-based multi-workspace or single workspace
    let provisionedWorkspace: Awaited<ReturnType<typeof executionWorkspacesSvc.provisionExecutionWorkspace>> | null = null;
    const provisionedWorkspacesByProjectWsId = new Map<string, Awaited<ReturnType<typeof executionWorkspacesSvc.provisionExecutionWorkspace>>>();

    if (existingApproval.type === "approve_issue_plan") {
      if (delegations && delegations.length > 0 && primaryIssueId) {
        // Multi-workspace: provision per unique projectWorkspaceId in delegations
        const primaryIssue = await issuesSvc.getById(primaryIssueId);
        if (primaryIssue?.projectId) {
          const projectWorkspaces = await projectsSvc.listWorkspaces(primaryIssue.projectId);
          const plans = buildExecutionWorkspacePlansForDelegations({
            issue: primaryIssue,
            delegations,
            projectWorkspaces,
          });
          for (const [pwsId, plan] of plans) {
            const provisioned = await executionWorkspacesSvc.provisionExecutionWorkspace({
              companyId: existingApproval.companyId,
              plan,
              force: req.body.force === true,
            });
            provisionedWorkspacesByProjectWsId.set(pwsId, provisioned);
            if (!provisionedWorkspace) provisionedWorkspace = provisioned; // first as default
          }
        }
      } else if (workspacePlan) {
        // Single workspace (existing behavior)
        provisionedWorkspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
          companyId: existingApproval.companyId,
          plan: workspacePlan,
          force: req.body.force === true,
        });
      }
    }

    // Store delegation→workspace mapping in approval payload for child issue resolution
    if (delegations && provisionedWorkspacesByProjectWsId.size > 0) {
      const delegationWorkspaceMap: Record<string, string> = {};
      for (const delegation of delegations) {
        if (!delegation.projectWorkspaceId) continue;
        const ews = provisionedWorkspacesByProjectWsId.get(delegation.projectWorkspaceId);
        if (ews) delegationWorkspaceMap[delegation.agentName] = ews.id;
      }
      await svc.updatePayload(existingApproval.id, {
        ...existingApproval.payload,
        _delegationWorkspaceMap: delegationWorkspaceMap,
      });
    }

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
              issueTitle: primaryIssue.title,
              issueDescription: primaryIssue.description,
              ticketKey: executionWorkspace.ticketKey,
              branch: pullRequestBranch,
              baseBranch: pullRequestBaseBranch,
              changedPaths,
              childIssues,
              approvalSummary: (existingApproval.payload?.summary as string) ?? null,
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
      if (primaryIssue?.executionWorkspaceId) {
        await executionWorkspacesSvc.updateSyncState(primaryIssue.executionWorkspaceId, {
          syncStatus: "pr_open",
          lastPrCheckedAt: new Date(),
          lastBaseCommitSha: pullRequestResult.baseBranch ? approval.payload.lastBaseCommitSha as string | null ?? null : null,
          lastBranchCommitSha: pullRequestResult.commitSha,
          pullRequestUrl: pullRequestResult.pullRequestUrl,
          pullRequestNumber:
            typeof pullRequestResult.pullRequestNumber === "number"
              ? String(pullRequestResult.pullRequestNumber)
              : null,
          prOpenedAt: new Date(),
          conflictSummary: null,
          escalationSummary: null,
        });
      }

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

      // Cascade-close child issues of completed parent issues
      for (const linkedIssue of linkedIssues) {
        const childIssues = await db
          .select()
          .from(issueTable)
          .where(and(eq(issueTable.parentId, linkedIssue.id), not(inArray(issueTable.status, ["done", "cancelled"]))));
        for (const child of childIssues) {
          await issuesSvc.update(child.id, { status: "done" });
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "issue.cascade_completed_after_pr",
            entityType: "issue",
            entityId: child.id,
            details: {
              parentIssueId: linkedIssue.id,
              approvalId: approval.id,
              previousStatus: child.status,
            },
          });
        }
      }
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

    // Post the answer as an issue comment so the agent can read it from the
    // issue timeline (the wakeup payload also carries the answer, but agents
    // that inspect comments need a persisted record).
    if (approval.type === "agent_question" && req.body.decisionNote) {
      const question =
        typeof approval.payload.question === "string" ? approval.payload.question : "에이전트 질문";
      const answerComment =
        `## 에이전트 질문 답변\n\n` +
        `**질문**: ${question}\n\n` +
        `**답변**: ${req.body.decisionNote}`;
      for (const linkedIssue of linkedIssues) {
        const comment = await issuesSvc.addComment(linkedIssue.id, answerComment, {
          userId: req.actor.userId ?? "board",
        });
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
            source: "agent_question_answer",
          },
        });
      }
    }

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
            ...(approval.type === "agent_question"
              ? {
                  answer: req.body.decisionNote ?? null,
                  question:
                    typeof approval.payload.question === "string"
                      ? approval.payload.question
                      : null,
                }
              : {}),
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
      const commentBody =
        approval.type === "agent_question"
          ? `## 에이전트 질문 거절\n\n${note}`
          : `**거절** (${approval.type})\n\n${note}`;
      await issuesSvc.addComment(linked.id, commentBody, {
        userId: req.actor.userId ?? "board",
      });

      // Unblock issue so agent can reassess (not applicable for agent_question)
      if (approval.type !== "agent_question") {
        const issue = await issuesSvc.getById(linked.id);
        if (issue && issue.status === "blocked") {
          await issuesSvc.update(linked.id, { status: "in_progress" });
        }
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

        // Resume issue so the agent can rework it
        const issue = await issuesSvc.getById(linked.id);
        if (issue && (issue.status === "blocked" || issue.status === "in_review")) {
          await issuesSvc.update(linked.id, {
            status: "in_progress",
            assigneeAgentId: approval.requestedByAgentId,
            assigneeUserId: null,
          });
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

    let normalizedPayload = req.body.payload
      ? existing.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            existing.companyId,
            req.body.payload,
            { strictMode: strictSecretsMode },
          )
        : req.body.payload
      : undefined;

    // For approve_issue_plan resubmissions: validate delegations and rebuild workspace plan
    // Check BOTH new payload and existing payload — even if agent sends no payload, enforce delegation rules
    if (existing.type === "approve_issue_plan") {
      const effectivePayload = normalizedPayload ?? (existing.payload as Record<string, unknown>);
      const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(id);
      const primaryIssue = linkedIssues[0] ?? null;
      console.log(`[resubmit] type=${existing.type} hasNewPayload=${!!normalizedPayload} primaryIssue=${primaryIssue?.id} projectId=${primaryIssue?.projectId}`);
      if (primaryIssue?.projectId) {
        const projectWorkspaces = await projectsSvc.listWorkspaces(primaryIssue.projectId);
        const delegations = parseDelegationPlan(effectivePayload);
        console.log(`[resubmit] workspaces=${projectWorkspaces.length} hasDelegations=${!!delegations} effectivePayloadKeys=${Object.keys(effectivePayload ?? {}).join(",")}`);

        if (projectWorkspaces.length > 1) {

          // Multi-workspace: ALWAYS require delegations
          if (!delegations || delegations.length === 0) {
            const workspaceList = projectWorkspaces
              .map((ws) => `- ${ws.name} (id: ${ws.id}, cwd: ${ws.cwd})`)
              .join("\n");
            throw conflict(
              `This project has ${projectWorkspaces.length} workspaces. You must include a "delegations" array in the resubmit payload to specify which agent works in which workspace. Do NOT set "workspace" directly.\n\n` +
              `Available workspaces:\n${workspaceList}\n\n` +
              `Example resubmit payload:\n` +
              `{"payload": {"delegations": [{"agentName": "scorpio-fe-dev", "projectWorkspaceId": "<id>", "workspaceName": "shopping_md_fe", "tasks": ["UI implementation"]}], ...existing fields...}}\n\n` +
              `Use GET /api/projects/${primaryIssue.projectId}/workspaces to list workspaces and their IDs.`,
            );
          }

          // Delegations provided: rebuild workspace plan from delegations
          const plans = buildExecutionWorkspacePlansForDelegations({
            issue: primaryIssue,
            delegations,
            projectWorkspaces,
          });
          const firstPlan = plans.values().next().value;
          if (firstPlan) {
            // Merge delegations workspace into payload (override any manually-set workspace)
            normalizedPayload = {
              ...effectivePayload,
              ...(normalizedPayload ?? {}),
              workspace: firstPlan,
            };
          }
        }
      }
    }

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
