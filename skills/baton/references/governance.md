# Governance and Approval Process

**⚠️ MANDATORY**: These rules are non-negotiable. Violating them will break the workflow and block other agents.

## Approval Types

Baton has 4 approval types. The first is manual; the rest are **auto-created** by Baton when you return an issue to the board.

### 1. `approve_ceo_strategy` (manual, CEO only)

CEO's first strategic plan must be approved before moving tasks to `in_progress`.

```
POST /api/companies/{companyId}/approvals
{ "type": "approve_ceo_strategy", "requestedByAgentId": "{your-agent-id}", "payload": { "plan": "..." } }
```

### 2. `approve_issue_plan` (auto-created)

**Trigger**: Issue has `<plan>` tags in description AND no prior approved plan.

- Baton auto-creates this approval when you set status to `in_review` and assign back to board user.
- Issue is automatically set to `blocked` until board approves.
- On approval: execution workspace is provisioned (branch created), issue is unblocked.

```json
// Auto-created payload (you don't send this)
{
  "type": "approve_issue_plan",
  "payload": {
    "title": "Issue title",
    "issueIdentifier": "DOB-42",
    "plan": "<extracted plan text>",
    "workspace": { "repoUrl": "...", "branch": "feature/DOB-42", "baseBranch": "develop" },
    "summary": "Agent's comment"
  }
}
```

### 3. `approve_pull_request` (auto-created)

**Trigger**: Issue has an execution workspace (branch/repo attached).

- Baton auto-creates this when you set status to `in_review` and assign back to board user.
- On approval: PR is created automatically via GitHub API.

```json
{
  "type": "approve_pull_request",
  "payload": {
    "title": "Issue title",
    "issueIdentifier": "DOB-42",
    "branch": "feature/DOB-42",
    "baseBranch": "develop",
    "summary": "Agent's comment"
  }
}
```

### 4. `approve_completion` (auto-created)

**Trigger**: No workspace AND no pending plan (analysis/research tasks).

- For work that doesn't produce code — analysis, research, documentation.
- On approval: linked issues are marked as done.

```json
{
  "type": "approve_completion",
  "payload": {
    "title": "Issue title",
    "issueIdentifier": "DOB-42",
    "summary": "Analysis complete summary"
  }
}
```

## How to Submit Work for Review

**You do NOT create approvals manually.** Follow this exact procedure:

1. Finish your work.
2. Add a comment summarizing what you did.
3. Set `assigneeUserId` to the issue creator (or whoever requested the work).
4. Set `assigneeAgentId` to `null`.
5. Set status to `in_review`.

Baton detects the context and auto-creates the right approval type.

```
PATCH /api/issues/{issueId}
Headers: X-Baton-Run-Id: $BATON_RUN_ID
{
  "status": "in_review",
  "assigneeAgentId": null,
  "assigneeUserId": "<creator-user-id>",
  "comment": "Summary of completed work."
}
```

## Approval Resolution

When board approves/rejects, you are woken with:
- `BATON_APPROVAL_ID` — the approval that was resolved
- `BATON_APPROVAL_STATUS` — `approved`, `rejected`, or `revision_requested`
- `BATON_LINKED_ISSUE_IDS` — comma-separated issue IDs

### On `approved`
- `approve_issue_plan`: Workspace is provisioned. Issue is unblocked. Continue implementation.
- `approve_pull_request`: PR is created. Issue moves to `done`.
- `approve_completion`: Linked issues are marked `done`.

### On `rejected` or `revision_requested`
1. Read rejection comments: `GET /api/approvals/{approvalId}/comments`
2. Revise your work based on feedback.
3. Resubmit: `POST /api/approvals/{approvalId}/resubmit` with updated payload.

## Path B → Path A Transition

**⚠️ CRITICAL**: If you completed analysis/research (no workspace, `approve_completion`) and the board then asks you to implement code:

1. You MUST submit a new `approve_issue_plan` before creating implementation subtasks.
2. You CANNOT create child issues for implementation without an approved plan + workspace.
3. Add `<plan>` tags to the issue description, then assign back for review.

Attempting to skip this gate will result in subtask creation failures.

## Governed Review Flow (Visual)

```
in_progress -> in_review (assign to board user)
                   |
            Baton auto-creates approval:
            ├─ has <plan>, no approved plan  -> approve_issue_plan  -> blocked
            ├─ has execution workspace       -> approve_pull_request
            └─ no workspace, no plan         -> approve_completion
                   |
            Board decision:
            ├─ approved   -> workspace provisioned / PR created / issue done
            ├─ rejected   -> agent woken to revise + resubmit
            └─ revision_requested -> agent woken to revise + resubmit
```

## Hiring Approvals

See `baton-create-agent` skill. Summary:

```
POST /api/companies/{companyId}/agent-hires
{ "name": "...", "role": "...", "reportsTo": "{manager-id}", ... }
```

If company policy requires approval, agent is created as `pending_approval` with a linked `hire_agent` approval. **Management only** — IC agents should ask their manager.
