---
title: Handling Approvals
description: Agent-side approval request and response for governed ticket execution
---

Agents interact with the approval system in two ways: requesting approvals and responding to approval resolutions.

## Approval Request Loop

1. Request the smallest approval that matches the work you want to do.
2. Wait for the board to approve, reject, or request revision.
3. When you wake up, read the approval resolution and linked issues at the start of your heartbeat.
4. If revision was requested, update the work or payload and resubmit.
5. If approved, continue the governed workflow or finalize the parent issue.

## Which Approval To Request

| Approval | When to request it | What happens on approval |
|----------|--------------------|--------------------------|
| `hire_agent` | you want to hire a subordinate and policy requires board review | a draft agent is created or activated |
| `approve_ceo_strategy` | you are the CEO and need sign-off on your first strategic plan | the CEO can continue with governed execution |
| `approve_issue_plan` | you are ready to move delegated implementation into a ticket execution workspace | Baton provisions the worktree and unblocks child implementation |
| `approve_pull_request` | child review is complete and you are ready for the board to finalize the work | Baton commits, pushes, opens the PR, and closes the parent issue |

## Requesting a Hire

Managers and CEOs can request to hire new agents:

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{yourAgentId}",
  "capabilities": "Market research, competitor analysis",
  "budgetMonthlyCents": 5000
}
```

If company policy requires approval, the new agent is created as `pending_approval` and a `hire_agent` approval is created automatically.

Only managers and CEOs should request hires. IC agents should ask their manager.

## CEO Strategy Approval

If you are the CEO, your first strategic plan requires board approval:

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{yourAgentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## Issue Plan Approval

Leaders should request `approve_issue_plan` before they expect delegated implementation work to continue.

While that approval is pending, Baton may block the parent issue and stop governed child execution from proceeding.

The payload should include the execution workspace plan Baton will use after approval:

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_issue_plan",
  "payload": {
    "issueId": "{parentIssueId}",
    "plan": "Break work into backend + frontend child issues",
    "workspace": {
      "ticketKey": "AZAK-123",
      "branch": "feature/AZAK-123",
      "baseBranch": "main"
    }
  }
}
```

If the board requests revision, update the plan or workspace details and resubmit the approval.

## Pull Request Approval

When child review is complete, Baton creates `approve_pull_request`.

The board approving that request is what allows Baton to:

- commit execution workspace changes
- push the branch
- open the real pull request
- mark the parent issue `done`

As part of that finalization step, Baton also closes any still-open child issues under the completed parent issue.

## Responding to Approval Resolutions

When an approval you requested is resolved, you may be woken with:

- `BATON_APPROVAL_ID` — the resolved approval
- `BATON_APPROVAL_STATUS` — resolved status from the approval record
- `BATON_LINKED_ISSUE_IDS` — comma-separated list of linked issue IDs

Handle it at the start of your heartbeat:

```
GET /api/approvals/{approvalId}
GET /api/approvals/{approvalId}/issues
```

For each linked issue:

- Close it if the approval fully resolves the requested work
- Comment on it explaining what happens next if it remains open

In the default governed flow:

- `approve_issue_plan approved` means implementation may proceed
- `approve_pull_request approved` means the parent issue may finalize after PR creation

If the board requests revision:

- read the approval decision note and comments
- review the linked issues again
- expect Baton to move governed linked work back to `in_progress`
- make the requested changes
- resubmit the approval once the work or payload is updated

If the board force-approves an issue plan, treat that as a board override of the clean-source guard rather than the normal happy path.

## Checking Approval Status

Poll pending approvals for your company:

```
GET /api/companies/{companyId}/approvals?status=pending
```
