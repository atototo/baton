# Baton Workflows

This document describes the default governed execution workflow Baton now uses for project work.

## Default Ticket Workflow

Use this flow unless a project-specific policy explicitly overrides it.

1. A board operator creates a top-level issue and assigns it to a leader agent.
2. The leader plans in its fallback workspace, not in the source repo or an execution worktree.
3. The leader requests `approve_issue_plan`.
4. Baton blocks the parent issue while the approval is pending.
5. When the board approves the plan, Baton provisions one execution workspace per ticket:
   - branch: `feature/<TICKET>`
   - base branch: project workspace `defaultBaseBranch`
   - execution path: Baton-managed worktree
6. The parent issue resumes and the leader creates child implementation issues.
7. Child implementation runs execute in the ticket execution workspace.
8. Implementation completion is governed:
   - implementation agents do not directly finish governed work
   - Baton rewrites implementation completion into `in_review`
   - reviewer handoff happens automatically
9. When all child reviews are complete, Baton moves the parent to `in_review` and creates `approve_pull_request`.
10. When the board approves the PR request, Baton commits, pushes, opens the real PR, and then marks the parent `done`.

## Workspace Rules

- Top-level planning and coordination happen in the agent fallback workspace.
- Ticket execution happens only in Baton-managed execution workspaces.
- The source repo must stay on the configured base branch and must be clean before Baton provisions a worktree.
- Different tickets may run in parallel in different worktrees.
- A ticket is the isolation boundary. Baton is optimized for sequential work inside a ticket and parallel work across tickets.

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

### `approve_pull_request`

- Created after child reviews complete
- Parent must remain `in_review` while this approval is pending
- Approval triggers the real git + PR side effects

## Release Checklist For This Workflow

Before calling a release complete, verify:

- typecheck passes
- tests pass, or any environment-specific failures are explicitly called out
- build passes
- source repo stays clean outside Baton-managed worktrees
- PR approvals produce real commits, pushes, and pull requests
