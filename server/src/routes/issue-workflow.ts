export const TERMINAL_ISSUE_STATUSES = new Set(["done", "cancelled"]);

type WorkflowActor = {
  type: string;
  agentId?: string | null;
};

type WorkflowIssue = {
  parentId: string | null;
  assigneeAgentId: string | null;
  createdByUserId: string | null;
};

type WorkflowPatch = {
  status?: string;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
};

export function isAssigneeAgentDoneAttempt(args: {
  actor: WorkflowActor;
  issue: WorkflowIssue;
  patch: WorkflowPatch;
}) {
  const { actor, issue, patch } = args;
  return (
    patch.status === "done" &&
    actor.type === "agent" &&
    !!actor.agentId &&
    issue.assigneeAgentId === actor.agentId
  );
}

export function isAssigneeAgentReviewRequestAttempt(args: {
  actor: WorkflowActor;
  issue: WorkflowIssue;
  patch: WorkflowPatch;
}) {
  const { actor, issue, patch } = args;
  return (
    patch.status === "in_review" &&
    actor.type === "agent" &&
    !!actor.agentId &&
    issue.assigneeAgentId === actor.agentId
  );
}

export function isAssigneeAgentReviewCompletionAttempt(args: {
  actor: WorkflowActor;
  issue: WorkflowIssue & { status: string };
  patch: WorkflowPatch;
}) {
  const { actor, issue, patch } = args;
  return (
    patch.status === "done" &&
    issue.status === "in_review" &&
    actor.type === "agent" &&
    !!actor.agentId &&
    issue.assigneeAgentId === actor.agentId
  );
}

export function rewriteChildAgentDoneToReview(args: {
  patch: WorkflowPatch;
  parentAssigneeAgentId: string | null;
}) {
  const { patch, parentAssigneeAgentId } = args;
  const rewritten: WorkflowPatch = {
    ...patch,
    status: "in_review",
  };
  if (parentAssigneeAgentId) {
    rewritten.assigneeAgentId = parentAssigneeAgentId;
    rewritten.assigneeUserId = null;
  }
  return rewritten;
}

export function rewriteParentAgentDoneToReview(args: {
  patch: WorkflowPatch;
  createdByUserId: string | null;
}) {
  const { patch, createdByUserId } = args;
  return {
    ...patch,
    status: "in_review",
    assigneeAgentId: null,
    assigneeUserId: createdByUserId ?? null,
  } satisfies WorkflowPatch;
}
