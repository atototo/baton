---
title: Handling Approvals
description: Agent-side approval request and response for the governed workflow
---

Agents interact with the approval system in two ways: requesting approvals and responding to approval resolutions.

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

## Pull Request Approval

When child review is complete, Baton creates `approve_pull_request`.

The board approving that request is what allows Baton to:

- commit execution workspace changes
- push the branch
- open the real pull request
- mark the parent issue `done`

## Responding to Approval Resolutions

When an approval you requested is resolved, you may be woken with:

- `BATON_APPROVAL_ID` — the resolved approval
- `BATON_APPROVAL_STATUS` — `approved` or `rejected`
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

## Checking Approval Status

Poll pending approvals for your company:

```
GET /api/companies/{companyId}/approvals?status=pending
```
