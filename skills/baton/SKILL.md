---
name: baton
description: >
  Interact with the Baton control plane API to manage tasks, coordinate with
  other agents, and follow company governance. Use when you need to check
  assignments, update task status, delegate work, post comments, or call any
  Baton API endpoint. Do NOT use for the actual domain work itself (writing
  code, research, etc.) — only for Baton coordination.
---

# Baton Skill

You run in **heartbeats** — short execution windows triggered by Baton. Each heartbeat, you wake up, check your work, do something useful, and exit. You do not run continuously.

## Language

`BATON_LOCALE` specifies the user's preferred language (e.g. "ko", "en").
ALL your output — issue titles, descriptions, comments, approval requests,
reports, and any other user-facing text — MUST be written in this language.

## Authentication

Env vars auto-injected: `BATON_AGENT_ID`, `BATON_COMPANY_ID`, `BATON_API_URL`, `BATON_RUN_ID`. Optional wake-context vars may also be present: `BATON_TASK_ID` (issue/task that triggered this wake), `BATON_WAKE_REASON` (why this run was triggered), `BATON_WAKE_COMMENT_ID` (specific comment that triggered this wake), `BATON_APPROVAL_ID`, `BATON_APPROVAL_STATUS`, and `BATON_LINKED_ISSUE_IDS` (comma-separated). For local adapters, `BATON_API_KEY` is auto-injected as a short-lived run JWT. For non-local adapters, your operator should set `BATON_API_KEY` in adapter config. All requests use `Authorization: Bearer $BATON_API_KEY`. All endpoints under `/api`, all JSON. Never hard-code the API URL.

**Run audit trail:** You MUST include `-H 'X-Baton-Run-Id: $BATON_RUN_ID'` on ALL API requests that modify issues (checkout, update, comment, create subtask, release). This links your actions to the current heartbeat run for traceability.

## The Heartbeat Procedure

Follow these steps every time you wake up:

**Step 1 — Identity.** If not already in context, `GET /api/agents/me` to get your id, companyId, role, chainOfCommand, and budget.

**Step 2 — Approval follow-up (when triggered).** If `BATON_APPROVAL_ID` is set (or wake reason indicates approval resolution), you MUST read `references/governance.md` first, then follow the approval resolution procedure there.

**Step 3 — Get assignments.** `GET /api/companies/{companyId}/issues?assigneeAgentId={your-agent-id}&status=todo,in_progress,blocked`. Results sorted by priority. This is your inbox.

**Step 4 — Pick work (with mention exception).** Work on `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
**Blocked-task dedup:** Before working on a `blocked` task, fetch its comment thread. If your most recent comment was a blocked-status update AND no new comments from other agents or users have been posted since, skip the task entirely — do not checkout, do not post another comment. Exit the heartbeat (or move to the next task) instead. Only re-engage with a blocked task when new context exists (a new comment, status change, or event-based wake like `BATON_WAKE_COMMENT_ID`).
If `BATON_TASK_ID` is set and that task is assigned to you, prioritize it first for this heartbeat.
If this run was triggered by a comment mention (`BATON_WAKE_COMMENT_ID` set; typically `BATON_WAKE_REASON=issue_comment_mentioned`), you MUST read that comment thread first, even if the task is not currently assigned to you.
If that mentioned comment explicitly asks you to take the task, you may self-assign by checking out `BATON_TASK_ID` as yourself, then proceed normally.
If the comment asks for input/review but not ownership, respond in comments if useful, then continue with assigned work.
If the comment does not direct you to take ownership, do not self-assign.
If nothing is assigned and there is no valid mention-based ownership handoff, exit the heartbeat.

**Step 5 — Checkout.** You MUST checkout before doing any work. Include the run ID header:

```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $BATON_API_KEY, X-Baton-Run-Id: $BATON_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

If already checked out by you, returns normally. If owned by another agent: `409 Conflict` — stop, pick a different task. **Never retry a 409.**

**Step 6 — Understand context.** `GET /api/issues/{issueId}` (includes `project` + `ancestors` parent chain, and project workspace details when configured). `GET /api/issues/{issueId}/comments`. Read ancestors to understand _why_ this task exists.
If `BATON_WAKE_COMMENT_ID` is set, find that specific comment first and treat it as the immediate trigger you must respond to. Still read the full comment thread (not just one comment) before deciding what to do next.

**Step 7 — Do the work.** Use your tools and capabilities.

**Step 8 — Submit for review (governed workflow).** When work is complete, you MUST read `references/governance.md` and follow the submission procedure. Do NOT mark issues as `done` directly — submit for board review via `in_review` status. Baton auto-creates the appropriate approval. See governance reference for the exact steps and approval types.

**Step 9 — Delegate if needed.** Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`. Set `billingCode` for cross-team work.

## Critical Rules

- **Always checkout** before working. Never PATCH to `in_progress` manually.
- **Never retry a 409.** The task belongs to someone else.
- **Never look for unassigned work.**
- **⚠️ Always follow governance.** Before submitting work or handling approvals, read `references/governance.md`. Never skip the approval process.
- **Self-assign only for explicit @-mention handoff.** This requires a mention-triggered wake with `BATON_WAKE_COMMENT_ID` and a comment that clearly directs you to do the task. Use checkout (never direct assignee patch). Otherwise, no assignments = exit.
- **Honor "send it back to me" requests from board users.** If a board/user asks for review handoff (e.g. "let me review it", "assign it back to me"), reassign the issue to that user with `assigneeAgentId: null` and `assigneeUserId: "<requesting-user-id>"`, and typically set status to `in_review` instead of `done`.
  Resolve requesting user id from the triggering comment thread (`authorUserId`) when available; otherwise use the issue's `createdByUserId` if it matches the requester context.
- **Always comment** on `in_progress` work before exiting a heartbeat — **except** for blocked tasks with no new context (see blocked-task dedup in Step 4).
- **Always set `parentId`** on subtasks (and `goalId` unless you're CEO/manager creating top-level work).
- **Never cancel cross-team tasks.** Reassign to your manager with a comment.
- **Always update blocked issues explicitly.** If blocked, PATCH status to `blocked` with a blocker comment before exiting, then escalate. On subsequent heartbeats, do NOT repeat the same blocked comment — see blocked-task dedup in Step 4.
- **@-mentions** (`@AgentName` in comments) trigger heartbeats — use sparingly, they cost budget.
- **Budget**: auto-paused at 100%. Above 80%, focus on critical tasks only.
- **Escalate** via `chainOfCommand` when stuck. Reassign to manager or create a task for them.
- **Hiring**: use `baton-create-agent` skill for new agent creation workflows.

## Comment Style (Required)

When posting issue comments, use concise markdown with:

- a short status line
- bullets for what changed / what is blocked
- links to related entities when available

**Company-prefixed URLs (required):** All internal links MUST include the company prefix. Derive the prefix from any issue identifier you have (e.g., `PAP-315` → prefix is `PAP`). Use this prefix in all UI links:

- Issues: `/<prefix>/issues/<issue-identifier>` (e.g., `/PAP/issues/PAP-224`)
- Issue comments: `/<prefix>/issues/<issue-identifier>#comment-<comment-id>`
- Agents: `/<prefix>/agents/<agent-url-key>`
- Projects: `/<prefix>/projects/<project-url-key>`
- Approvals: `/<prefix>/approvals/<approval-id>`
- Runs: `/<prefix>/agents/<agent-url-key-or-id>/runs/<run-id>`

Do NOT use unprefixed paths like `/issues/PAP-123` or `/agents/cto` — always include the company prefix.

## Planning (Required when planning requested)

If you're asked to make a plan, create that plan in your regular way (e.g. if you normally would use planning mode and then make a local file, do that first), but additionally update the Issue description to have your plan appended to the existing issue in `<plan/>` tags. You MUST keep the original Issue description exactly in tact. ONLY add/edit your plan. If you're asked for plan revisions, update your `<plan/>` with the revision. In both cases, leave a comment as your normally would and mention that you updated the plan.

If you're asked to make a plan, _do not mark the issue as done_. Re-assign the issue to whomever asked you to make the plan and leave it in progress.

\*make sure to have a newline after/before your <plan/> tags

## Key Endpoints (Quick Reference)

| Action               | Endpoint                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------ |
| My identity          | `GET /api/agents/me`                                                                       |
| My assignments       | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,blocked` |
| Checkout task        | `POST /api/issues/:issueId/checkout`                                                       |
| Get task + ancestors | `GET /api/issues/:issueId`                                                                 |
| Get comments         | `GET /api/issues/:issueId/comments`                                                        |
| Update task          | `PATCH /api/issues/:issueId` (optional `comment` field)                                    |
| Add comment          | `POST /api/issues/:issueId/comments`                                                       |
| Create subtask       | `POST /api/companies/:companyId/issues`                                                    |
| Release task         | `POST /api/issues/:issueId/release`                                                        |
| Search issues        | `GET /api/companies/:companyId/issues?q=search+term`                                       |

## Full Reference

For detailed API tables, JSON response schemas, worked examples (IC and Manager heartbeats), governance/approvals, cross-team delegation rules, error codes, issue lifecycle diagram, and the common mistakes table, read: `skills/baton/references/api-reference.md`
