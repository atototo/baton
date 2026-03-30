# Workflow Session Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Baton's fragmented governed-workflow path with a session-based orchestration model that prevents stale replays, duplicate approvals, and post-success overwrite while preserving legitimate reopen/follow-up flows.

**Architecture:** Add a new `issue_workflow_sessions` runtime table plus lightweight workflow epoch fields on `issues`. Route-level approval creation and approval-consumption side effects move into a single orchestrator service that owns session lifecycle, approval linkage, conditional issue transitions, and wakeup semantics. Existing routes stay in place initially but delegate governed workflow decisions to the new service until the old duplicated logic can be removed safely.

**Tech Stack:** TypeScript, Express, Drizzle ORM, PostgreSQL/PGlite, Vitest, Supertest

---

### Task 1: Add the workflow session data model

**Files:**
- Modify: `packages/db/src/schema/issues.ts`
- Create: `packages/db/src/schema/issue_workflow_sessions.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/shared/src/constants.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`

- [ ] **Step 1: Write the failing schema-facing regression test names**

Add or extend integration tests to assert that a governed handoff creates a persisted workflow session linked to the issue and approval, and that duplicate handoff in the same workflow epoch reuses the session instead of creating a second one.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "workflow session|duplicate handoff"`

Expected: FAIL because the table/schema/service path does not exist yet.

- [ ] **Step 3: Add the new schema and constants**

Implement:
- `issues.workflowEpoch` default `0`
- `issues.activeWorkflowSessionId` nullable FK to the new table if feasible without circular-export problems; otherwise add the column first and enforce via service logic
- `issues.workflowUpdatedAt`
- `issue_workflow_sessions` with core columns:
  - `companyId`, `issueId`, `issueWorkflowEpoch`
  - `kind`, `status`, `fingerprint`
  - `approvalId`, `requestRunId`, `requestedByAgentId`, `requestedByUserId`
  - `gitSideEffectState`, `commitSha`, `pullRequestNumber`, `pullRequestUrl`, `branch`, `baseBranch`
  - `supersededBySessionId`, `reopenSignal`, `context`
  - `approvedAt`, `consumedAt`, `obsoletedAt`, timestamps
- shared constants for workflow session kinds/statuses/git-side-effect states

- [ ] **Step 4: Add indexes/uniqueness for dedupe**

Implement DB constraints/indexes that support:
- one `(issue_id, issue_workflow_epoch, kind, fingerprint)` session
- one `approval_id` per session when non-null
- fast lookup by `(issue_id, issue_workflow_epoch)` and `(issue_id, status)`

- [ ] **Step 5: Run the targeted test again**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "workflow session|duplicate handoff"`

Expected: still FAIL, but now due to missing orchestrator behavior rather than missing schema.

- [ ] **Step 6: Generate and inspect the migration**

Run: `pnpm db:generate`

Expected: migration adds the new table/columns without dropping existing workflow data.


### Task 2: Add a workflow session service layer

**Files:**
- Create: `server/src/services/issue-workflow-sessions.ts`
- Modify: `server/src/services/index.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`

- [ ] **Step 1: Write the failing service-level behavior test**

Add a regression that exercises:
- create/open a session for the first governed handoff
- look up the active session for an issue
- reuse the same session in the same epoch and fingerprint
- supersede/open a new session only after explicit reopen or revision signal

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "reuses the active workflow session|supersedes workflow session"`

Expected: FAIL because no service exists.

- [ ] **Step 3: Implement focused CRUD/helpers**

Implement service methods such as:
- `getActiveForIssue(issueId)`
- `listForIssue(issueId)`
- `findReusableSession(issueId, epoch, kind, fingerprint)`
- `openOrReuseSession(...)`
- `markApproved(...)`
- `markConsumed(...)`
- `markObsolete(...)`
- `markRevisionRequested(...)`
- `markRejected(...)`

Keep this service data-focused; do not embed route-specific logic yet.

- [ ] **Step 4: Re-run the targeted test**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "reuses the active workflow session|supersedes workflow session"`

Expected: PASS for session CRUD/reuse semantics.


### Task 3: Introduce the orchestrator for governed handoff creation

**Files:**
- Create: `server/src/services/issue-workflow-orchestrator.ts`
- Modify: `server/src/services/index.ts`
- Modify: `server/src/routes/issues/approval-helpers.ts`
- Modify: `server/src/routes/issues/issue-routes.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`

- [ ] **Step 1: Write the failing stale replay regression**

Add an integration test that reproduces the real failure:
1. Existing PR update approval is approved and consumed successfully with `commitSha`
2. The linked issue is moved to `done`
3. A stale leader run later attempts the same board handoff
4. Server must not create a new pending `approve_push_to_existing_pr`
5. Server must not overwrite the issue back to `in_review`

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "does not recreate existing-pr approval after consumed session"`

Expected: FAIL under the current route logic.

- [ ] **Step 3: Implement `submitReviewHandoff()` in the orchestrator**

Responsibilities:
- lock the issue row
- determine current workflow epoch
- derive `kind` from issue/workspace/PR state
- build a stable fingerprint from issue id + epoch + kind + workspace/PR identity
- detect an already consumed session in the current epoch and return no-op
- detect an existing open/revision session and reuse it
- create a new approval only when needed
- create/link/open the workflow session and update `issues.activeWorkflowSessionId`
- centralize obsolete/supersede rules now spread across `approval-helpers.ts`

- [ ] **Step 4: Replace route-level handoff creation with orchestrator usage**

Update `maybeCreateBoardReviewApproval` and the PATCH issue flow to call the orchestrator instead of directly deciding/deduping/linking approvals.

- [ ] **Step 5: Re-run the stale replay regression**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "does not recreate existing-pr approval after consumed session"`

Expected: PASS.


### Task 4: Move approval consumption into the orchestrator

**Files:**
- Modify: `server/src/services/issue-workflow-orchestrator.ts`
- Modify: `server/src/routes/approvals.ts`
- Modify: `server/src/routes/issues/approval-helpers.ts`
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`

- [ ] **Step 1: Write the failing approval-consumption regression**

Add or extend tests to require:
- `approve_pull_request` marks the session `consumed` only after PR open succeeds
- `approve_push_to_existing_pr` marks the session `consumed` only after commit/push succeeds and records `commitSha`
- stale approved-but-unconsumed legacy approvals are obsoleted and do not block a fresh session

- [ ] **Step 2: Run the targeted tests to verify failure**

Run: `pnpm test:run server/src/__tests__/pull-request-approval.integration.test.ts -t "existing PR|real PR side effect"`

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "existing-pr approval|approve_push_to_existing_pr|stale approved"`

Expected: FAIL because no session consumption exists yet.

- [ ] **Step 3: Implement `consumeApprovalDecision()`**

Responsibilities:
- resolve the session by `approvalId`
- re-read the linked issue under lock
- execute side effects for the specific session kind
- conditionally mutate issue state only if still compatible with the session/epoch
- update approval payload metadata
- mark session `approved` then `consumed`
- log reopen-safe metadata (`commitSha`, `pullRequestUrl`, `pullRequestNumber`)

Keep the “issue is still compatible” checks explicit:
- finish only if issue epoch/session still matches
- resume only if issue is blocked/in_review due to that same session
- never overwrite a newer epoch

- [ ] **Step 4: Slim down `/approvals/:id/approve`**

The route should:
- authorize
- validate
- delegate to the orchestrator
- emit the response

Keep existing response shape for UI/API compatibility.

- [ ] **Step 5: Re-run targeted approval tests**

Run:
- `pnpm test:run server/src/__tests__/pull-request-approval.integration.test.ts -t "existing PR|real PR side effect"`
- `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "existing-pr approval|approve_push_to_existing_pr|stale approved"`

Expected: PASS.


### Task 5: Add workflow epoch fencing for stale agent runs

**Files:**
- Modify: `server/src/routes/issues/issue-routes.ts`
- Modify: `server/src/services/heartbeat.ts`
- Modify: `server/src/routes/issues/comment-routes.ts`
- Modify: `server/src/services/issue-workflow-orchestrator.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`

- [ ] **Step 1: Write the failing stale-run write regression**

Add a test where:
1. agent A starts work in epoch N
2. board approval or reopen rotates the issue into epoch N+1
3. stale run from epoch N tries to PATCH the issue
4. server rejects or no-ops the write instead of overwriting the newer state

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "rejects stale run after workflow epoch changes"`

Expected: FAIL under current permissive write path.

- [ ] **Step 3: Implement epoch propagation and checks**

Implement:
- context snapshot / wakeup payload carries `workflowEpoch`
- issue PATCH path validates the actor run against current `issues.workflowEpoch`
- orchestrator increments epoch on board handoff, approved resume, revision resume, and explicit reopen transitions
- heartbeat wakeup includes the latest epoch for newly queued runs

- [ ] **Step 4: Re-run the stale-run regression**

Run: `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "rejects stale run after workflow epoch changes"`

Expected: PASS.


### Task 6: Migrate existing helper logic and remove duplication

**Files:**
- Modify: `server/src/routes/issues/approval-helpers.ts`
- Modify: `server/src/routes/approvals.ts`
- Modify: `server/src/routes/issues/issue-routes.ts`
- Modify: `server/src/services/approvals.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`
- Test: `server/src/__tests__/ticket-execution-workspace.integration.test.ts`

- [ ] **Step 1: Write failing regression coverage for preserved behavior**

Ensure tests still cover:
- parent plan approval gating before delegation
- question-answer resume to requester
- one pending approval/session under concurrent same-issue handoff
- revision-requested PR approval being superseded by existing-PR update flow

- [ ] **Step 2: Run the preserved-behavior tests**

Run:
- `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "agent_question|revision-requested|concurrently|parent"`
- `pnpm test:run server/src/__tests__/ticket-execution-workspace.integration.test.ts -t "approval flow|dedupes|inherit"`

Expected: Some failures while old/new logic overlap.

- [ ] **Step 3: Remove or reduce duplicated route logic**

Clean up:
- duplicate issue blocking in approval create vs helper
- duplicate workspace-plan enrichment paths
- obsolete unlink heuristics that are subsumed by session supersede rules

Keep compatibility shims only where tests require existing payload fields.

- [ ] **Step 4: Re-run the preserved-behavior tests**

Run:
- `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "agent_question|revision-requested|concurrently|parent"`
- `pnpm test:run server/src/__tests__/ticket-execution-workspace.integration.test.ts -t "approval flow|dedupes|inherit"`

Expected: PASS.


### Task 7: Update documentation and workflow guidance

**Files:**
- Modify: `doc/WORKFLOWS.md`
- Modify: `doc/SPEC-implementation.md`
- Modify: `doc/DATABASE.md`
- Modify: `server/src/onboarding-assets/ceo/HEARTBEAT.md`

- [ ] **Step 1: Document the new authority model**

Explain:
- issue current state vs workflow session history
- `approved` vs `consumed`
- explicit reopen/new follow-up signals
- stale run rejection by workflow epoch

- [ ] **Step 2: Document migration/compatibility**

Explain that existing approval rows remain, but workflow session records now govern dedupe and consumption.


### Task 8: Full verification before handoff

**Files:**
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`
- Test: `server/src/__tests__/review-governed-workflow.integration.test.ts`
- Test: `server/src/__tests__/ticket-execution-workspace.integration.test.ts`

- [ ] **Step 1: Run server typecheck**

Run: `pnpm exec tsc -p server/tsconfig.json --noEmit`

Expected: exit 0

- [ ] **Step 2: Run focused workflow tests**

Run:
- `pnpm test:run server/src/__tests__/pull-request-approval.integration.test.ts -t "existing PR|real PR side effect"`
- `pnpm test:run server/src/__tests__/review-governed-workflow.integration.test.ts -t "existing-pr approval|revision-requested pull request approval|approve_push_to_existing_pr|workflow session|stale run"`
- `pnpm test:run server/src/__tests__/ticket-execution-workspace.integration.test.ts -t "approval flow|dedupes|inherit"`

Expected: all pass

- [ ] **Step 3: Run repo verification required by AGENTS.md**

Run:
- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`

Expected: exit 0 for all commands

- [ ] **Step 4: Perform the live revalidation checklist**

Use `/Users/winter.e/easy-work/baton-dashboard` for a manual Baton validation pass:
1. create or resume a parent issue with child implementation flow
2. reach `approve_pull_request` or `approve_push_to_existing_pr`
3. approve and confirm `commitSha` lands in workflow session + approval payload
4. trigger a delayed stale leader wake/run intentionally
5. verify no duplicate approval is created and no completed issue is overwritten
6. verify explicit reopen still creates a new session and allows a legitimate follow-up update
