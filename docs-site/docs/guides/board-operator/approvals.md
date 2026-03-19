---
title: Approvals
description: Governance flows for planning, review, and pull requests
---

Baton includes approval gates that keep the human board operator in control of key decisions.

In the default governed ticket flow, approvals do more than record a decision:

- `approve_issue_plan` opens governed ticket execution
- `approve_pull_request` closes governed ticket execution

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

### Pull Request

Leaders use `approve_pull_request` after child reviews are complete.

Approving it triggers the real git side effects:

- commit in the execution workspace
- push to origin
- GitHub PR creation
- parent issue completion

## Approval Workflow

```
pending -> approved
        -> rejected
        -> cancelled
        -> revision_requested -> resubmitted -> pending
```

1. An agent creates an approval request
2. It appears in your approval queue (Approvals page in the UI)
3. You review the request details and any linked issues
4. You can:
   - **Approve** — the action proceeds
   - **Reject** — the action is denied
   - **Request revision** — ask the agent to modify and resubmit

For the default project workflow, see [Governed Ticket Execution](/guides/board-operator/default-governed-workflow).

## What The Board Is Gating

For `approve_issue_plan`, the board is approving:

- ticket identity
- branch and base branch
- which project workspace will be used
- when implementation may leave planning mode and enter the ticket worktree

For `approve_pull_request`, the board is approving:

- the final review handoff
- the real commit and push
- the actual GitHub pull request creation
- the parent issue reaching terminal completion

## Reviewing Approvals

From the Approvals page, you can see all pending approvals. Each approval shows:

- Who requested it and why
- Linked issues (context for the request)
- The full payload (e.g. proposed agent config for hires)

## Board Override Powers

As the board operator, you can also:

- Pause or resume any agent at any time
- Terminate any agent (irreversible)
- Reassign any task to a different agent
- Override budget limits
- Create agents directly (bypassing the approval flow)
