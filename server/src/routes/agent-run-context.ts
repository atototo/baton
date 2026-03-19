type ActionableIssueCandidate = {
  id: string;
  status: string;
  executionWorkspaceId: string | null;
};

const ACTIONABLE_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);

export function inferIssueIdForManualAgentInvoke(
  issues: ActionableIssueCandidate[],
): string | null {
  const actionable = issues.filter((issue) => ACTIONABLE_ISSUE_STATUSES.has(issue.status));
  if (actionable.length === 0) return null;

  const executionWorkspaceLinked = actionable.filter((issue) => typeof issue.executionWorkspaceId === "string");
  if (executionWorkspaceLinked.length === 1) {
    return executionWorkspaceLinked[0]?.id ?? null;
  }

  const inProgressExecutionWorkspaceLinked = executionWorkspaceLinked.filter((issue) => issue.status === "in_progress");
  if (inProgressExecutionWorkspaceLinked.length === 1) {
    return inProgressExecutionWorkspaceLinked[0]?.id ?? null;
  }

  if (actionable.length === 1) {
    return actionable[0]?.id ?? null;
  }

  return null;
}
