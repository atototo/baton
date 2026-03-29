# Baton Workflows

This document is the canonical explainer for how Baton currently executes governed ticket work.
Use it to understand the runtime model first.
See `SPEC-implementation.md` for contract language and `DATABASE.md` for the underlying records.

## What Baton Does Now

Baton separates planning from implementation.
Leaders plan in a fallback workspace.
Approved implementation runs in a Baton-managed execution workspace scoped to a single ticket.
Review and pull request creation are part of the workflow, not prompt conventions.

### 1. Default Governed Ticket Execution

1. A board operator creates a top-level parent issue and assigns it to a leader agent.
2. The leader plans in its fallback workspace, not in the source repo and not in a ticket worktree.
3. The leader requests `approve_issue_plan`.
4. Baton blocks the parent while that approval is pending.
5. On approval, Baton provisions one ticket-scoped execution workspace:
   - branch: `feature/<TICKET>` by default
   - base branch: project workspace `defaultBaseBranch`
   - execution path: Baton-managed git worktree
6. The parent resumes and the leader creates child implementation issues.
7. Child implementation runs inside the ticket execution workspace.
8. Child completion is governed:
   - implementation agents do not directly finish governed ticket work
   - Baton rewrites child completion to `in_review`
   - reviewer handoff happens automatically
9. When child reviews complete, Baton moves the parent to `in_review`.
10. Before opening PR approval, Baton syncs the execution branch with the latest base branch and records whether the branch is merge-ready.
11. If sync succeeds, Baton creates `approve_pull_request`.
12. When the board approves the PR request, Baton commits, pushes, opens the real PR, and only then marks the parent `done`.

### 2. Parallelism Rules

- A ticket is the isolation boundary.
- Different tickets may run in parallel in different execution workspaces.
- A single ticket is optimized for controlled sequential progress rather than free-for-all parallel edits.
- The source repo must remain on the configured base branch and be clean before Baton provisions a worktree.
- Baton-managed worktrees are runtime state. They are not the source repo checkout.

### 3. Status Meaning

- `todo`: ready to begin, but not yet executing
- `in_progress`: active implementation or coordination work is running
- `blocked`: waiting on approval, input, permissions, or another external dependency
- `in_review`: implementation is complete enough for reviewer or board handoff, but the workflow is not finished
- `done`: terminal completion after the governed workflow has really closed

In this model, `done` means more than "the coding is done".
For governed ticket work, it means review and PR approval have already been completed.

### 4. Approval Gate Meaning

- `approve_issue_plan`: opens governed ticket execution
- `approve_pull_request`: closes governed ticket execution

`approve_issue_plan` is the gate between planning and code execution.
`approve_pull_request` is the gate between review-complete work and real git/PR side effects.

## Diagrams

### Issue State Transition

```text
normal path

backlog -> todo -> in_progress -> in_review -> done
                     |              ^
                     v              |
                   blocked ---------+

blocked entry examples
- plan approval pending
- missing input or permissions
- external dependency

governed rules
- child assignee "done" is rewritten to "in_review"
- parent cannot move to "done" while approve_pull_request is pending
- parent reaches real "done" only after PR approval side effects succeed
```

### Ticket Execution Architecture

```text
board
  |
  v
parent issue (leader-owned)
  |
  | planning only
  v
leader fallback workspace
  |
  | approve_issue_plan
  v
Baton provisions execution workspace for one ticket

source repo (base branch stays clean, e.g. main)
  |
  +--> execution workspace: feature/AZAK-010
  |       |
  |       +--> child issue: backend work
  |       +--> child issue: frontend work
  |       +--> reviewer handoff
  |
  +--> execution workspace: feature/AZAK-011
          |
          +--> child issues for that ticket only

approve_pull_request
  |
  v
real commit -> push -> GitHub PR -> parent done
```

### Parallel Tickets Example

```text
same repo: /repos/azak
base branch in source repo: main

ticket AZAK-010
- execution workspace: .../AZAK-010/repo
- branch: feature/AZAK-010
- child flow:
  parent -> child backend -> review -> parent in_review -> PR approval -> done

ticket AZAK-011
- execution workspace: .../AZAK-011/repo
- branch: feature/AZAK-011
- child flow:
  parent -> child frontend -> review -> parent in_review -> PR approval -> done

result
- both tickets can progress in parallel
- each ticket keeps its own branch, cwd, and child workflow
- the shared source repo remains the clean base checkout
```

## Default Ticket Workflow

Use this flow unless a project-specific policy explicitly overrides it.

1. A board operator creates a top-level issue and assigns it to a leader agent.
2. The leader plans in its fallback workspace.
3. The leader requests `approve_issue_plan`.
4. Baton blocks the parent issue while the approval is pending.
5. When the board approves the plan, Baton provisions one execution workspace per ticket.
6. The parent resumes and the leader creates child implementation issues.
7. Child implementation runs execute in the ticket execution workspace.
8. Child completion is rewritten into review handoff.
9. When child reviews complete, Baton moves the parent to `in_review`.
10. Baton runs pre-PR branch sync against the latest base branch.
11. If sync is clean and verification is still valid, Baton creates `approve_pull_request`.
12. When the board approves the PR request, Baton performs the real git + PR side effects and then closes the parent.

## Workspace Rules

- Top-level planning and coordination happen in the agent fallback workspace.
- Normal-path ticket execution happens only in Baton-managed execution workspaces.
- The source repo must stay on the configured base branch and must be clean before Baton provisions a worktree.
- Different tickets may run in parallel in different worktrees.
- A ticket is the isolation boundary. Baton is optimized for sequential work inside a ticket and parallel work across tickets.

### Degraded Fallback Behavior

If a linked execution workspace is missing or temporarily unavailable, Baton may warn and fall back to the agent workspace for that run.
That is a degraded path, not the intended steady-state governed workflow.

## Default Reviewer Resolution

Current default behavior:

- reviewer = parent issue assignee agent

This means:

- if a leader delegates implementation, the leader becomes the reviewer by default
- if a future project config introduces a dedicated reviewer agent, reviewer selection should move to policy rather than stay hardcoded

## Agent Composition Examples

### Leader Only

- Suitable for planning-only or small coordination tasks
- No child implementation issues are required
- No ticket worktree is provisioned unless governed implementation begins

### Leader + Implementation Agents

- Most common default
- Leader plans, requests approval, creates child issues
- Implementation agents work in the ticket worktree
- Leader reviews by default

### Leader + Dedicated Reviewer

- Supported conceptually, but current default resolver still uses the parent assignee
- To make a separate reviewer the default, Baton needs workflow policy-based reviewer selection

## Why Child Dedupe Exists

Leader runs can resume, retry, or be woken more than once while delegating.
Because of that, Baton treats child creation as idempotent.

Current dedupe order:

1. `parentId + assignee + delegation.kind + delegation.key` for active child issues
2. fallback to normalized title matching when delegation metadata is absent

Terminal child issues (`done`, `cancelled`) do not block future work with the same delegation key.

## Approval Gates

### `approve_issue_plan`

- Required before implementation child issues should proceed
- Must include the execution workspace plan
- Keeps the parent blocked until the decision is made
- On approval, provisions the ticket execution workspace and relinks the governed run context

### `approve_pull_request`

- Created after child reviews complete
- Created only after Baton confirms the execution branch is synchronized with the latest base branch
- Parent must remain `in_review` while this approval is pending
- Approval triggers the real git + PR side effects
- Parent reaches `done` only after those side effects succeed

## Release Checklist For This Workflow

Before calling a release complete, verify:

- typecheck passes
- tests pass, or any environment-specific failures are explicitly called out
- build passes
- source repo stays clean outside Baton-managed worktrees
- PR approvals produce real commits, pushes, and pull requests
