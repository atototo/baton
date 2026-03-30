import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { approvals, issueApprovals, issues } from "@atototo/db";
import { conflict, forbidden } from "../errors.js";
import { issueService } from "./issues.js";
import { issueWorkflowSessionService } from "./issue-workflow-sessions.js";

type ApprovalBackedWorkflowKind =
  | "issue_plan"
  | "pull_request"
  | "push_to_existing_pr"
  | "completion";

export function issueWorkflowOrchestrator(db: Db) {
  const sessions = issueWorkflowSessionService(db);
  const issuesSvc = issueService(db);
  type IssueWorkflowPatch = {
    status?: string;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
  };

  async function getIssueForSession(issueId: string, companyId?: string) {
    const rows = await db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        assigneeAgentId: issues.assigneeAgentId,
        workflowEpoch: issues.workflowEpoch,
        activeWorkflowSessionId: issues.activeWorkflowSessionId,
      })
      .from(issues)
      .where(companyId ? and(eq(issues.id, issueId), eq(issues.companyId, companyId)) : eq(issues.id, issueId));
    return rows[0] ?? null;
  }

  async function getIssueWorkflowState(issueId: string, companyId?: string) {
    const rows = await db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        parentId: issues.parentId,
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        createdByUserId: issues.createdByUserId,
        identifier: issues.identifier,
      })
      .from(issues)
      .where(companyId ? and(eq(issues.id, issueId), eq(issues.companyId, companyId)) : eq(issues.id, issueId));
    return rows[0] ?? null;
  }

  async function bumpIssueWorkflowEpoch(args: {
    issueId: string;
    companyId?: string;
    activeWorkflowSessionId?: string | null;
  }) {
    const issue = await getIssueForSession(args.issueId, args.companyId);
    if (!issue) return null;
    const nextWorkflowEpoch = (issue.workflowEpoch ?? 0) + 1;
    const updated = await db
      .update(issues)
      .set({
        workflowEpoch: nextWorkflowEpoch,
        activeWorkflowSessionId:
          args.activeWorkflowSessionId !== undefined
            ? args.activeWorkflowSessionId
            : (issue.activeWorkflowSessionId ?? null),
        workflowUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        args.companyId
          ? and(eq(issues.id, args.issueId), eq(issues.companyId, args.companyId))
          : eq(issues.id, args.issueId),
      )
      .returning({
        id: issues.id,
        companyId: issues.companyId,
        workflowEpoch: issues.workflowEpoch,
        activeWorkflowSessionId: issues.activeWorkflowSessionId,
      });
    return updated[0] ?? null;
  }

  return {
    approvalTypeToWorkflowKind(type: string): ApprovalBackedWorkflowKind | null {
      switch (type) {
        case "approve_issue_plan":
          return "issue_plan";
        case "approve_pull_request":
          return "pull_request";
        case "approve_push_to_existing_pr":
          return "push_to_existing_pr";
        case "approve_completion":
          return "completion";
        default:
          return null;
      }
    },

    buildFingerprint(args: {
      issueId: string;
      kind: ApprovalBackedWorkflowKind;
      executionWorkspaceId?: string | null;
      branch?: string | null;
      baseBranch?: string | null;
    }) {
      const { issueId, kind, executionWorkspaceId, branch, baseBranch } = args;
      return [
        issueId,
        kind,
        executionWorkspaceId ?? "no-workspace",
        branch?.trim() || "no-branch",
        baseBranch?.trim() || "no-base",
      ].join(":");
    },

    async beginApprovalHandoff(args: {
      companyId: string;
      issueId: string;
      currentWorkflowEpoch: number;
      kind: ApprovalBackedWorkflowKind;
      executionWorkspaceId?: string | null;
      branch?: string | null;
      baseBranch?: string | null;
      source?: string;
    }) {
      const fingerprint = this.buildFingerprint({
        issueId: args.issueId,
        kind: args.kind,
        executionWorkspaceId: args.executionWorkspaceId ?? null,
        branch: args.branch ?? null,
        baseBranch: args.baseBranch ?? null,
      });

      const consumedSession = await sessions.findReusableSession({
        issueId: args.issueId,
        epoch: args.currentWorkflowEpoch,
        kind: args.kind,
        fingerprint,
        statuses: ["consumed"],
      });
      if (consumedSession) {
        throw conflict("Workflow handoff already consumed for the current issue state.", {
          issueId: args.issueId,
          issueWorkflowSessionId: consumedSession.id,
          issueWorkflowEpoch: consumedSession.issueWorkflowEpoch,
          workflowKind: args.kind,
          source: args.source ?? null,
        });
      }

      const updatedIssue = await bumpIssueWorkflowEpoch({
        issueId: args.issueId,
        companyId: args.companyId,
      });

      return {
        issueWorkflowEpoch: updatedIssue?.workflowEpoch ?? args.currentWorkflowEpoch + 1,
        fingerprint,
      };
    },

    async evaluateAgentMutationAuthority(args: {
      issueId: string;
      companyId?: string;
      actorAgentId: string;
    }) {
      const issue = await getIssueForSession(args.issueId, args.companyId);
      if (!issue) {
        return {
          allowed: false,
          reason: "issue_not_found" as const,
          statusCode: 404,
          message: "Issue not found",
        };
      }

      if ((issue.workflowEpoch ?? 0) > 0 && issue.assigneeAgentId !== args.actorAgentId) {
        return {
          allowed: false,
          reason: "workflow_advanced" as const,
          statusCode: 409,
          message:
            "Issue workflow has advanced. This agent run is no longer the active owner for mutations.",
        };
      }

      return {
        allowed: true,
        reason: "allowed" as const,
        statusCode: 200,
        message: null,
      };
    },

    async normalizeAgentWorkflowPatch(args: {
      issueId: string;
      companyId?: string;
      actorType: string;
      actorAgentId?: string | null;
      patch: IssueWorkflowPatch;
    }) {
      const issue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!issue) throw conflict("Issue not found");

      const isAgentAssignee =
        args.actorType === "agent" &&
        !!args.actorAgentId &&
        issue.assigneeAgentId === args.actorAgentId;
      const isDoneAttempt = args.patch.status === "done" && isAgentAssignee;
      const isReviewRequestAttempt = args.patch.status === "in_review" && isAgentAssignee;
      const isReviewCompletionAttempt =
        args.patch.status === "done" &&
        issue.status === "in_review" &&
        isAgentAssignee;

      let patch = { ...args.patch };
      let workflowForcedAssigneeChange = false;

      if (isDoneAttempt) {
        if (issue.parentId) {
          if (!isReviewCompletionAttempt) {
            const parentIssue = await getIssueWorkflowState(issue.parentId, issue.companyId);
            patch = {
              ...patch,
              status: "in_review",
              ...(parentIssue?.assigneeAgentId
                ? {
                    assigneeAgentId: parentIssue.assigneeAgentId,
                    assigneeUserId: null,
                  }
                : {}),
            };
            if (parentIssue?.assigneeAgentId) {
              workflowForcedAssigneeChange = true;
            }
          }
        } else {
          const directChildren = await db
            .select({
              id: issues.id,
              identifier: issues.identifier,
              status: issues.status,
            })
            .from(issues)
            .where(and(eq(issues.companyId, issue.companyId), eq(issues.parentId, issue.id)));
          const nonTerminalChildren = directChildren.filter(
            (child) => child.status !== "done" && child.status !== "cancelled",
          );
          if (nonTerminalChildren.length > 0) {
            throw conflict("Cannot mark parent issue done while direct child issues are still active", {
              issueId: issue.id,
              openChildIssueIds: nonTerminalChildren.map((child) => child.id),
              openChildIssueIdentifiers: nonTerminalChildren.map((child) => child.identifier),
            });
          }
          patch = {
            ...patch,
            status: "in_review",
            assigneeAgentId: null,
            assigneeUserId: issue.createdByUserId ?? null,
          };
          workflowForcedAssigneeChange = true;
        }
      }

      if (isReviewRequestAttempt && issue.parentId) {
        const parentIssue = await getIssueWorkflowState(issue.parentId, issue.companyId);
        patch = {
          ...patch,
          status: "in_review",
          ...(parentIssue?.assigneeAgentId
            ? {
                assigneeAgentId: parentIssue.assigneeAgentId,
                assigneeUserId: null,
              }
            : {}),
        };
        if (parentIssue?.assigneeAgentId) {
          workflowForcedAssigneeChange = true;
        }
      }

      return {
        patch,
        workflowForcedAssigneeChange,
      };
    },

    async prepareIssuePatchUpdate(args: {
      issueId: string;
      companyId?: string;
      actorType: string;
      actorAgentId?: string | null;
      requestedPatch: IssueWorkflowPatch;
    }) {
      const issue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!issue) throw conflict("Issue not found");

      const normalizedWorkflowPatch = await this.normalizeAgentWorkflowPatch({
        issueId: args.issueId,
        companyId: args.companyId,
        actorType: args.actorType,
        actorAgentId: args.actorAgentId ?? null,
        patch: args.requestedPatch,
      });
      const patch = normalizedWorkflowPatch.patch;
      const workflowForcedAssigneeChange = normalizedWorkflowPatch.workflowForcedAssigneeChange;

      const requestedAssigneeWillChange =
        (args.requestedPatch.assigneeAgentId !== undefined &&
          args.requestedPatch.assigneeAgentId !== issue.assigneeAgentId) ||
        (args.requestedPatch.assigneeUserId !== undefined &&
          args.requestedPatch.assigneeUserId !== issue.assigneeUserId);

      const assigneeWillChange =
        (patch.assigneeAgentId !== undefined && patch.assigneeAgentId !== issue.assigneeAgentId) ||
        (patch.assigneeUserId !== undefined && patch.assigneeUserId !== issue.assigneeUserId);

      const isAgentReturningIssueToCreator =
        args.actorType === "agent" &&
        !!args.actorAgentId &&
        issue.assigneeAgentId === args.actorAgentId &&
        patch.assigneeAgentId === null &&
        typeof patch.assigneeUserId === "string" &&
        (issue.createdByUserId ? patch.assigneeUserId === issue.createdByUserId : true);

      return {
        issue,
        patch,
        workflowForcedAssigneeChange,
        requestedAssigneeWillChange,
        assigneeWillChange,
        isAgentReturningIssueToCreator,
      };
    },

    async applyWorkflowAwareIssuePatch(args: {
      issueId: string;
      companyId?: string;
      actorType: string;
      actorAgentId?: string | null;
      requestedPatch: IssueWorkflowPatch;
      assertCanAssign?: () => Promise<void>;
      assertParentPlanApprovedBeforeDelegation?: () => Promise<void>;
      assertAgentMutationAuthority?: () => Promise<void>;
      afterUpdate?: (
        updatedIssue: Awaited<ReturnType<typeof issuesSvc.getById>>,
        context: {
          updateFields: IssueWorkflowPatch;
          assigneeWillChange: boolean;
          isAgentReturningIssueToCreator: boolean;
          workflowForcedAssigneeChange: boolean;
        },
      ) => Promise<void>;
    }) {
      const prepared = await this.prepareIssuePatchUpdate(args);
      const { issue: existing, patch, workflowForcedAssigneeChange, assigneeWillChange, requestedAssigneeWillChange, isAgentReturningIssueToCreator } = prepared;
      const hasFieldMutations = Object.keys(args.requestedPatch).length > 0;

      if (!hasFieldMutations) {
        const currentIssue = await issuesSvc.getById(existing.id);
        return {
          issue: currentIssue,
          updateFields: patch,
          previous: {},
          hasFieldMutations,
          assigneeWillChange,
          requestedAssigneeWillChange,
          isAgentReturningIssueToCreator,
          workflowForcedAssigneeChange,
        };
      }

      if (assigneeWillChange) {
        await this.assertIssueExecutionAllowed({
          issueId: existing.id,
          companyId: existing.companyId,
          reason: "assign",
        });
        if (!isAgentReturningIssueToCreator && !workflowForcedAssigneeChange) {
          await args.assertCanAssign?.();
        }
        if (!workflowForcedAssigneeChange && existing.parentId) {
          await args.assertParentPlanApprovedBeforeDelegation?.();
        }
      }

      if (patch.status === "in_progress") {
        await this.assertIssueExecutionAllowed({
          issueId: existing.id,
          companyId: existing.companyId,
          reason: "in_progress",
        });
        await this.assertAncestorExecutionAllowed({
          issueId: existing.id,
          companyId: existing.companyId,
          reason: "in_progress",
        });
      }
      if (patch.status === "in_review") {
        await this.assertInReviewTransitionAllowed({
          issueId: existing.id,
          companyId: existing.companyId,
        });
      }
      if (patch.status === "done") {
        await this.assertIssueCompletionAllowed({
          issueId: existing.id,
          companyId: existing.companyId,
        });
      }

      await args.assertAgentMutationAuthority?.();

      const updatedIssue = await this.updateIssueWithBoardReviewRollback({
        issueId: existing.id,
        patch,
        existingSnapshot: {
          status: existing.status,
          assigneeAgentId: existing.assigneeAgentId,
          assigneeUserId: existing.assigneeUserId ?? null,
        },
        shouldRollback: isAgentReturningIssueToCreator,
        afterUpdate: args.afterUpdate
          ? async (issue) => {
              await args.afterUpdate?.(issue, {
                updateFields: patch,
                assigneeWillChange,
                isAgentReturningIssueToCreator,
                workflowForcedAssigneeChange,
              });
            }
          : undefined,
      });

      const previous: Record<string, unknown> = {};
      for (const key of Object.keys(patch)) {
        if (
          key in existing &&
          (existing as Record<string, unknown>)[key] !== (patch as Record<string, unknown>)[key]
        ) {
          previous[key] = (existing as Record<string, unknown>)[key];
        }
      }

      return {
        issue: updatedIssue,
        updateFields: patch,
        previous,
        hasFieldMutations,
        assigneeWillChange,
        requestedAssigneeWillChange,
        isAgentReturningIssueToCreator,
        workflowForcedAssigneeChange,
      };
    },

    async assertInReviewTransitionAllowed(args: {
      issueId: string;
      companyId?: string;
    }) {
      const issue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!issue) {
        throw conflict("Issue not found");
      }

      const pendingQuestions = await db
        .select({ approvalId: issueApprovals.approvalId })
        .from(issueApprovals)
        .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
        .where(
          and(
            eq(issueApprovals.issueId, issue.id),
            eq(approvals.companyId, issue.companyId),
            eq(approvals.type, "agent_question"),
            inArray(approvals.status, ["pending"]),
          ),
        );
      if (pendingQuestions.length > 0) {
        throw forbidden(
          "Cannot submit for review while an agent question is pending. Answer the question first.",
        );
      }

      const childIssues = await db
        .select({ id: issues.id, identifier: issues.identifier, status: issues.status })
        .from(issues)
        .where(and(eq(issues.parentId, issue.id), eq(issues.companyId, issue.companyId)));
      const activeChildren = childIssues.filter(
        (child) => child.status !== "done" && child.status !== "cancelled",
      );
      if (activeChildren.length > 0) {
        const childList = activeChildren.map((child) => `${child.identifier ?? child.id} (${child.status})`).join(", ");
        throw forbidden(
          `Cannot submit for review while child issues are still active: ${childList}. Complete or cancel all child issues first.`,
        );
      }
    },

    async planParentBoardReviewAdvance(args: {
      completedIssueId: string;
      previousStatus: string;
      nextStatus: string;
      actorType: string;
      actorAgentId?: string | null;
      companyId?: string;
    }) {
      if (args.actorType !== "agent" || !args.actorAgentId) return null;
      if (args.previousStatus !== "in_review" || args.nextStatus !== "done") return null;

      const completedIssue = await getIssueWorkflowState(args.completedIssueId, args.companyId);
      if (!completedIssue?.parentId) return null;

      const parentIssue = await getIssueWorkflowState(completedIssue.parentId, completedIssue.companyId);
      if (!parentIssue) return null;

      const directChildren = await db
        .select({
          id: issues.id,
          identifier: issues.identifier,
          status: issues.status,
        })
        .from(issues)
        .where(and(eq(issues.companyId, parentIssue.companyId), eq(issues.parentId, parentIssue.id)));
      const nonTerminalChildren = directChildren.filter(
        (child) => child.status !== "done" && child.status !== "cancelled",
      );
      if (nonTerminalChildren.length > 0) return null;

      if (
        parentIssue.status === "in_review" &&
        parentIssue.assigneeAgentId == null &&
        parentIssue.createdByUserId != null
      ) {
        return null;
      }

      const parentPatch = (
        await this.normalizeAgentWorkflowPatch({
          issueId: parentIssue.id,
          companyId: parentIssue.companyId,
          actorType: "agent",
          actorAgentId: parentIssue.assigneeAgentId,
          patch: { status: "done" },
        })
      ).patch;

      const summary =
        `## 리뷰 완료 — 보드 승인 요청\n\n` +
        `하위 이슈 리뷰가 모두 끝났습니다. PR 승인 후 parent를 마감할 수 있습니다.\n\n` +
        directChildren
          .map((child) => {
            const issuePrefix = parentIssue.identifier?.split("-")[0] ?? "issues";
            return `- [${child.identifier}](/${issuePrefix}/issues/${child.identifier})`;
          })
          .join("\n");

      return {
        parentIssueId: parentIssue.id,
        parentPatch,
        summary,
      };
    },

    async advanceParentAfterChildReviewCompletion(args: {
      completedIssueId: string;
      previousStatus: string;
      nextStatus: string;
      actorType: string;
      actorAgentId?: string | null;
      companyId?: string;
    }) {
      const plan = await this.planParentBoardReviewAdvance(args);
      if (!plan) return null;
      const parentIssue = await issuesSvc.getById(plan.parentIssueId);
      if (!parentIssue) return null;
      const updatedParent = await issuesSvc.update(plan.parentIssueId, plan.parentPatch);
      if (!updatedParent) return null;
      return {
        parentIssue,
        updatedParent,
        parentPatch: plan.parentPatch,
        summary: plan.summary,
      };
    },

    async updateIssueWithBoardReviewRollback(args: {
      issueId: string;
      patch: Partial<typeof issues.$inferInsert>;
      existingSnapshot: {
        status: string;
        assigneeAgentId: string | null;
        assigneeUserId: string | null;
      };
      shouldRollback: boolean;
      afterUpdate?: (updatedIssue: Awaited<ReturnType<typeof issuesSvc.getById>>) => Promise<void>;
    }) {
      const updatedIssue = await issuesSvc.update(args.issueId, args.patch);
      if (!updatedIssue) return null;

      try {
        if (args.afterUpdate) {
          await args.afterUpdate(updatedIssue);
        }
      } catch (error) {
        if (args.shouldRollback && updatedIssue.status === "in_review") {
          await issuesSvc.update(args.issueId, {
            status: args.existingSnapshot.status,
            assigneeAgentId: args.existingSnapshot.assigneeAgentId,
            assigneeUserId: args.existingSnapshot.assigneeUserId,
          });
        }
        throw error;
      }

      return updatedIssue;
    },

    async assertIssueExecutionAllowed(args: {
      issueId: string;
      companyId?: string;
      reason: "checkout" | "assign" | "subtask" | "in_progress";
    }) {
      const issue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!issue) {
        throw conflict("Issue not found");
      }

      const blockingApprovals = await db
        .select({
          id: approvals.id,
          type: approvals.type,
          status: approvals.status,
        })
        .from(issueApprovals)
        .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
        .where(
          and(
            eq(issueApprovals.issueId, issue.id),
            eq(approvals.companyId, issue.companyId),
            inArray(approvals.type, ["approve_issue_plan", "approve_pull_request"]),
            inArray(approvals.status, ["pending", "revision_requested"]),
          ),
        );
      const blockingPushApproval = await db
        .select({
          id: approvals.id,
          type: approvals.type,
          status: approvals.status,
        })
        .from(issueApprovals)
        .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
        .where(
          and(
            eq(issueApprovals.issueId, issue.id),
            eq(approvals.companyId, issue.companyId),
            eq(approvals.type, "approve_push_to_existing_pr"),
            inArray(approvals.status, ["pending", "revision_requested"]),
          ),
        );
      if (blockingApprovals.length === 0 && blockingPushApproval.length === 0) return;

      const blockingPlanApproval = blockingApprovals.find((approval) => approval.type === "approve_issue_plan");
      const blockingPullRequestApproval = blockingApprovals.find(
        (approval) => approval.type === "approve_pull_request" && approval.status === "pending",
      );
      const blockingPushToExistingPrApproval = blockingPushApproval.find(
        (approval) => approval.type === "approve_push_to_existing_pr" && approval.status === "pending",
      );
      const messageByReason = {
        checkout: "Cannot start work while issue plan approval is pending",
        assign: "Cannot assign work while issue plan approval is pending",
        subtask: "Cannot create subtasks while issue plan approval is pending",
        in_progress: "Cannot move issue to in_progress while issue plan approval is pending",
      } as const;
      if (blockingPlanApproval) {
        throw forbidden(messageByReason[args.reason]);
      }
      if (blockingPullRequestApproval) {
        throw forbidden("Cannot resume implementation while pull request approval is pending");
      }
      if (blockingPushToExistingPrApproval) {
        throw forbidden("Cannot resume implementation while existing pull request update approval is pending");
      }
    },

    async assertAncestorExecutionAllowed(args: {
      issueId: string;
      companyId?: string;
      reason: "checkout" | "in_progress";
    }) {
      const currentIssue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!currentIssue) {
        throw conflict("Issue not found");
      }
      const ancestors = await issuesSvc.getAncestors(args.issueId);
      if (ancestors.length === 0) return;

      for (const ancestor of ancestors) {
        const blockingApprovals = await db
          .select({ id: approvals.id })
          .from(issueApprovals)
          .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
          .where(
            and(
              eq(issueApprovals.issueId, ancestor.id),
              eq(approvals.companyId, args.companyId ?? currentIssue.companyId),
              eq(approvals.type, "approve_issue_plan"),
              inArray(approvals.status, ["pending", "revision_requested"]),
            ),
          );
        if (blockingApprovals.length === 0) continue;
        const messageByReason = {
          checkout: "Cannot start work while parent issue plan approval is pending",
          in_progress: "Cannot move issue to in_progress while parent issue plan approval is pending",
        } as const;
        throw forbidden(messageByReason[args.reason]);
      }
    },

    async assertIssueCompletionAllowed(args: {
      issueId: string;
      companyId?: string;
    }) {
      const issue = await getIssueWorkflowState(args.issueId, args.companyId);
      if (!issue) {
        throw conflict("Issue not found");
      }

      const blockingApprovals = await db
        .select({ id: approvals.id })
        .from(issueApprovals)
        .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
        .where(
          and(
            eq(issueApprovals.issueId, issue.id),
            eq(approvals.companyId, issue.companyId),
            inArray(approvals.type, ["approve_pull_request", "approve_completion"]),
            inArray(approvals.status, ["pending", "revision_requested"]),
          ),
        );
      const blockingPushApprovals = await db
        .select({ id: approvals.id })
        .from(issueApprovals)
        .innerJoin(approvals, eq(approvals.id, issueApprovals.approvalId))
        .where(
          and(
            eq(issueApprovals.issueId, issue.id),
            eq(approvals.companyId, issue.companyId),
            eq(approvals.type, "approve_push_to_existing_pr"),
            inArray(approvals.status, ["pending", "revision_requested"]),
          ),
        );
      if (blockingApprovals.length > 0 || blockingPushApprovals.length > 0) {
        throw conflict("Cannot mark issue done while approval is pending", {
          approvalIds: [...blockingApprovals, ...blockingPushApprovals].map((approval) => approval.id),
        });
      }
    },

    async openOrReuseApprovalSession(args: {
      companyId: string;
      issueId: string;
      issueWorkflowEpoch: number;
      approvalId: string;
      kind: ApprovalBackedWorkflowKind;
      requestedByAgentId?: string | null;
      requestedByUserId?: string | null;
      requestRunId?: string | null;
      branch?: string | null;
      baseBranch?: string | null;
      executionWorkspaceId?: string | null;
      context?: Record<string, unknown>;
    }) {
      const fingerprint = this.buildFingerprint({
        issueId: args.issueId,
        kind: args.kind,
        executionWorkspaceId: args.executionWorkspaceId,
        branch: args.branch,
        baseBranch: args.baseBranch,
      });

      const existing = await sessions.findReusableSession({
        issueId: args.issueId,
        epoch: args.issueWorkflowEpoch,
        kind: args.kind,
        fingerprint,
        statuses: ["open", "revision_requested", "approved", "consumed"],
      });
      if (existing) {
        await db
          .update(issues)
          .set({
            activeWorkflowSessionId: existing.id,
            workflowUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(issues.id, args.issueId), eq(issues.companyId, args.companyId)));
        return existing;
      }

      const currentIssue = await db
        .select({
          activeWorkflowSessionId: issues.activeWorkflowSessionId,
        })
        .from(issues)
        .where(and(eq(issues.id, args.issueId), eq(issues.companyId, args.companyId)))
        .then((rows) => rows[0] ?? null);

      const created = await sessions.create({
        companyId: args.companyId,
        issueId: args.issueId,
        issueWorkflowEpoch: args.issueWorkflowEpoch,
        approvalId: args.approvalId,
        kind: args.kind,
        status: "open",
        fingerprint,
        requestRunId: args.requestRunId ?? null,
        requestedByAgentId: args.requestedByAgentId ?? null,
        requestedByUserId: args.requestedByUserId ?? null,
        branch: args.branch ?? null,
        baseBranch: args.baseBranch ?? null,
        context: args.context ?? {},
      });

      if (
        currentIssue?.activeWorkflowSessionId &&
        currentIssue.activeWorkflowSessionId !== created.id
      ) {
        const previousActive = await sessions.getById(currentIssue.activeWorkflowSessionId).catch(() => null);
        if (
          previousActive &&
          ["open", "revision_requested", "approved"].includes(previousActive.status)
        ) {
          await sessions.markObsolete(previousActive.id, created.id);
        }
      }

      await db
        .update(issues)
        .set({
          activeWorkflowSessionId: created.id,
          workflowUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(issues.id, args.issueId), eq(issues.companyId, args.companyId)));

      return created;
    },

    async attachApprovalWorkflowSession(args: {
      companyId: string;
      issue: {
        id: string;
        workflowEpoch?: number | null;
        executionWorkspaceId?: string | null;
      };
      approval: {
        id: string;
        type: string;
        requestedByAgentId?: string | null;
        requestedByUserId?: string | null;
        payload?: Record<string, unknown> | null;
      };
      requestRunId?: string | null;
      source: string;
      context?: Record<string, unknown>;
    }) {
      const workflowKind = this.approvalTypeToWorkflowKind(args.approval.type);
      if (!workflowKind) return null;

      return this.openOrReuseApprovalSession({
        companyId: args.companyId,
        issueId: args.issue.id,
        issueWorkflowEpoch: args.issue.workflowEpoch ?? 0,
        approvalId: args.approval.id,
        kind: workflowKind,
        requestedByAgentId: args.approval.requestedByAgentId ?? null,
        requestedByUserId: args.approval.requestedByUserId ?? null,
        requestRunId: args.requestRunId ?? null,
        branch:
          args.approval.payload && typeof args.approval.payload.branch === "string"
            ? args.approval.payload.branch
            : null,
        baseBranch:
          args.approval.payload && typeof args.approval.payload.baseBranch === "string"
            ? args.approval.payload.baseBranch
            : null,
        executionWorkspaceId: args.issue.executionWorkspaceId ?? null,
        context: {
          source: args.source,
          approvalType: args.approval.type,
          ...(args.context ?? {}),
        },
      });
    },

    async markApprovalSessionApproved(args: {
      approvalId: string;
    }) {
      const session = await sessions.getByApprovalId(args.approvalId);
      if (!session) return null;
      return sessions.markApproved(session.id, args.approvalId);
    },

    async consumeApprovalSession(args: {
      approvalId: string;
      patch?: Partial<typeof import("@atototo/db").issueWorkflowSessions.$inferInsert>;
    }) {
      const session = await sessions.getByApprovalId(args.approvalId);
      if (!session) return null;
      return sessions.markConsumed(session.id, args.patch);
    },

    async requestRevisionForApproval(args: {
      approvalId: string;
      reopenSignal?: string | null;
    }) {
      const session = await sessions.getByApprovalId(args.approvalId);
      if (!session) return null;
      const updatedSession = await sessions.markRevisionRequested(session.id, {
        reopenSignal: args.reopenSignal ?? "revision_requested",
      });
      await bumpIssueWorkflowEpoch({
        issueId: session.issueId,
        companyId: session.companyId,
        activeWorkflowSessionId: session.id,
      });
      return updatedSession;
    },

    async rejectApprovalSession(args: {
      approvalId: string;
      reopenSignal?: string | null;
      bumpIssueEpoch?: boolean;
      activeWorkflowSessionId?: string | null;
    }) {
      const session = await sessions.getByApprovalId(args.approvalId);
      if (!session) return null;
      const updatedSession = await sessions.markRejected(session.id, {
        reopenSignal: args.reopenSignal ?? "board_rejected",
      });
      if (args.bumpIssueEpoch) {
        await bumpIssueWorkflowEpoch({
          issueId: session.issueId,
          companyId: session.companyId,
          activeWorkflowSessionId:
            args.activeWorkflowSessionId === undefined ? session.id : args.activeWorkflowSessionId,
        });
      }
      return updatedSession;
    },

    async resubmitApprovalSession(args: {
      approvalId: string;
    }) {
      const session = await sessions.getByApprovalId(args.approvalId);
      if (!session) return null;
      const updatedSession = await sessions.update(session.id, {
        status: "open",
        reopenSignal: "resubmitted",
      });
      const issue = await getIssueForSession(session.issueId, session.companyId);
      if (issue && issue.activeWorkflowSessionId !== session.id) {
        await db
          .update(issues)
          .set({
            activeWorkflowSessionId: session.id,
            workflowUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(issues.id, session.issueId), eq(issues.companyId, session.companyId)));
      }
      return updatedSession;
    },

    bumpIssueWorkflowEpoch,
  };
}
