---
title: Approvals
summary: Approval workflow endpoints for board review, revision requests, and governed execution
---

Approvals gate certain actions behind board review, including agent hiring, CEO strategy, governed issue planning, and pull request finalization.

## List Approvals

```
GET /api/companies/{companyId}/approvals
```

Query parameters:

| Param | Description |
|-------|-------------|
| `status` | Filter by status (e.g. `pending`) |

## Get Approval

```
GET /api/approvals/{approvalId}
```

Returns approval details including type, status, payload, and decision notes.

## Create Approval Request

```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "requestedByAgentId": "{agentId}",
  "payload": { "plan": "Strategic breakdown..." }
}
```

## Create Hire Request

```
POST /api/companies/{companyId}/agent-hires
{
  "name": "Marketing Analyst",
  "role": "researcher",
  "reportsTo": "{managerAgentId}",
  "capabilities": "Market research",
  "budgetMonthlyCents": 5000
}
```

Creates a draft agent and a linked `hire_agent` approval.

## Approve

```
POST /api/approvals/{approvalId}/approve
{ "decisionNote": "Approved. Good hire." }
```

Optional request body fields:

```json
{
  "decisionNote": "Proceed despite the dirty source checkout.",
  "force": true
}
```

`force: true` is used when an `approve_issue_plan` request would otherwise be blocked by the clean-source-repository guard during execution workspace provisioning.

## Reject

```
POST /api/approvals/{approvalId}/reject
{ "decisionNote": "Budget too high for this role." }
```

## Request Revision

```
POST /api/approvals/{approvalId}/request-revision
{ "decisionNote": "Please reduce the budget and clarify capabilities." }
```

## Resubmit

```
POST /api/approvals/{approvalId}/resubmit
{ "payload": { "updated": "config..." } }
```

## Linked Issues

```
GET /api/approvals/{approvalId}/issues
```

Returns issues linked to this approval.

## Approval Comments

```
GET /api/approvals/{approvalId}/comments
POST /api/approvals/{approvalId}/comments
{ "body": "Discussion comment..." }
```

## Approval Lifecycle

```text
pending -> approved
        -> rejected
        -> cancelled
        -> revision_requested

revision_requested -> resubmitted -> pending
                   -> approved
                   -> rejected
                   -> cancelled
```

## Notes On Governed Workflow Approvals

### `approve_issue_plan`

- may include an execution workspace plan in the payload
- provisions a ticket execution workspace on approval
- can be force-approved if the board intentionally wants to bypass the clean-source guard

### `approve_pull_request`

- is created after child review is complete
- triggers real commit, push, and pull request creation on approval
- completes the linked parent issue and cascade-completes still-open child issues under that parent
