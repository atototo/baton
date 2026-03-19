---
title: Default Governed Workflow
description: The default plan -> worktree -> review -> PR flow Baton now enforces
---

This guide describes the default project workflow Baton uses when a leader delegates implementation work.

## Default Flow

1. A board operator creates a top-level issue and assigns it to a leader agent.
2. The leader plans in its fallback workspace.
3. The leader requests **Issue Plan Approval**.
4. Baton moves the parent issue to `blocked`.
5. When the board approves the plan, Baton provisions one execution workspace per ticket:
   - branch: `feature/<TICKET>`
   - base branch: the project workspace default base branch
   - runtime path: a Baton-managed git worktree
6. The parent resumes and the leader creates child implementation issues.
7. Implementation agents work inside the ticket execution workspace.
8. When implementation completes, Baton rewrites the child to `in_review` and hands it to the reviewer.
9. When all child reviews are done, Baton moves the parent to `in_review` and creates **PR Approval**.
10. When the board approves the PR request, Baton commits, pushes, opens the real PR, and only then marks the parent `done`.

## Workspace Rules

- Top-level planning does **not** run in the source repo.
- Approved implementation does **not** run in the shared source repo either.
- Baton creates one execution workspace per ticket and keeps the source repo on the configured base branch.
- Different tickets can run in parallel in different worktrees.
- A single ticket is the isolation boundary for code execution.

## Default Reviewer Behavior

Current default behavior:

- reviewer = parent issue assignee agent

In the common setup, that means the leader acts as the reviewer by default.

## Agent Composition Examples

### Leader + Implementation Agents

This is the default setup Baton currently supports best.

- leader plans and delegates
- implementation agents execute child work
- leader reviews child work
- board approves the PR request

### Leader + Dedicated Reviewer

This is possible conceptually, but Baton does not yet use policy-based reviewer selection by default.

If you want a dedicated reviewer to become the default, add that as a workflow policy feature rather than relying on task titles or prompts.

## Why Baton Dedupes Child Issues

Leader runs can be retried or resumed. That means the same child creation request may be sent more than once.

Baton dedupes active children by:

- parent
- assignee
- delegation metadata (`kind` + `key`) when present

If delegation metadata is absent, Baton falls back to normalized title matching.

Terminal child issues (`done`, `cancelled`) do not block future work with the same delegation key.

## Approval Types In This Workflow

### Issue Plan Approval

Used before implementation begins.

- blocks the parent while pending
- carries the execution workspace plan
- provisions the ticket worktree on approval

### PR Approval

Used after child reviews complete.

- keeps the parent in `in_review` while pending
- triggers the real commit, push, and pull request creation on approval

## Practical Checks

Before approving a plan, check:

- ticket key
- branch name
- base branch
- project workspace
- repo path

Before approving a PR, check:

- child reviews are complete
- the PR branch matches the parent ticket
- the generated PR content summarizes the actual changes
