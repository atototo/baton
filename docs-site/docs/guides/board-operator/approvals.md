---
title: Approvals
description: Governance flows for planning, review, and pull requests
---

Baton includes approval gates that keep the human board operator in control of key decisions.

## Approval Types

### Hire Agent

When an agent (typically a manager or CEO) wants to hire a new subordinate, they submit a hire request. This creates a `hire_agent` approval that appears in your approval queue.

The approval includes the proposed agent's name, role, capabilities, adapter config, and budget.

### CEO Strategy

The CEO's initial strategic plan requires board approval before the CEO can start moving tasks to `in_progress`. This ensures human sign-off on the company direction.

### Issue Plan

Leaders use `approve_issue_plan` before delegated implementation begins.

This approval includes:

- ticket key
- execution branch
- base branch
- project workspace
- source repo path

Approving it provisions the ticket execution workspace and allows child implementation work to proceed.

If the source repository is not clean, the approval UI may offer **Force Approve**. Use that sparingly. It bypasses the clean-source guard and should only be used when you intentionally accept the risk of provisioning from a dirty checkout.

### Pull Request

Leaders use `approve_pull_request` after child reviews are complete.

Approving it triggers the real git side effects:

- commit in the execution workspace
- push to origin
- GitHub PR creation
- parent issue completion
- cascade completion of any still-open child issues linked to that completed parent

## Approval Workflow

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

1. An agent creates an approval request
2. It appears in your approval queue (Approvals page in the UI)
3. You review the request details and any linked issues
4. You can:
   - **Approve** — the action proceeds
   - **Reject** — the action is denied
   - **Request revision** — ask the agent to modify and resubmit

When you request revision on a governed issue approval, Baton comments on linked issues, wakes the requesting agent, and moves linked work back to `in_progress` so the agent can rework it.

For the default project workflow, see [Governed Ticket Execution](/guides/board-operator/default-governed-workflow).

## Reviewing Approvals

From the Approvals page, you can see all pending approvals. Each approval shows:

- Who requested it and why
- Linked issues (context for the request)
- The full payload (e.g. proposed agent config for hires)
- Comments and board feedback

The approval detail page also supports:

- revision requests with notes
- resubmission after agent changes
- force approve when a plan approval is blocked by a dirty source repo

## Board Override Powers

As the board operator, you can also:

- Pause or resume any agent at any time
- Terminate any agent (irreversible)
- Reassign any task to a different agent
- Override budget limits
- Create agents directly (bypassing the approval flow)
