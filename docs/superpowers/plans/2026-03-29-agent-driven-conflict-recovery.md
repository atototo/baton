# Agent-Driven Conflict Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically re-engage the assignee agent when Baton detects an unresolved execution workspace conflict, then verify and either recover or escalate the workspace state.

**Architecture:** Reuse the existing wakeup queue and heartbeat run lifecycle instead of introducing a new recovery queue. Persist recovery-specific state on `execution_workspaces`, enqueue recovery wakeups with structured `recoveryContext`, and treat post-run branch verification as the source of truth for whether recovery succeeded.

**Tech Stack:** TypeScript, Drizzle ORM, Express services/routes, Vitest, PGlite integration tests

---

### Task 1: Extend Execution Workspace Recovery State

**Files:**
- Modify: `packages/db/src/schema/execution_workspaces.ts`
- Create: `packages/db/src/migrations/0032_agent_driven_conflict_recovery.sql`
- Modify: `packages/shared/src/types/issue.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`

- [ ] **Step 1: Add failing test expectations for recovery metadata**

Update the pull request approval integration test so a conflicted workspace is expected to include recovery state fields after Baton queues recovery.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: FAIL because recovery fields do not exist yet.

- [ ] **Step 3: Add schema columns and shared contract fields**

Add these columns to `execution_workspaces` and expose them in shared issue workspace payloads:

- `recoveryStatus`
- `recoveryReason`
- `recoveryRequestedAt`
- `recoveryStartedAt`
- `recoveryFinishedAt`
- `recoveryAttemptCount`
- `lastRecoveryRunId`

- [ ] **Step 4: Create the migration**

Create `packages/db/src/migrations/0032_agent_driven_conflict_recovery.sql` to add the new columns with safe defaults.

- [ ] **Step 5: Re-run the targeted test**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: still FAIL, but now because orchestration logic is missing rather than schema/type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/execution_workspaces.ts packages/db/src/migrations/0032_agent_driven_conflict_recovery.sql packages/shared/src/types/issue.ts packages/shared/src/types/index.ts packages/shared/src/index.ts server/src/__tests__/pull-request-approval.integration.test.ts
git commit -m "Add execution workspace recovery metadata"
```

### Task 2: Queue Recovery Requests When Conflict Handling Stops

**Files:**
- Modify: `server/src/services/execution-workspaces.ts`
- Modify: `server/src/routes/approvals.ts`
- Modify: `server/src/services/heartbeat.ts`
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`

- [ ] **Step 1: Write failing tests for recovery queueing**

Add integration coverage for:

- pre-PR conflict queues one recovery wakeup request for the assignee
- post-PR drift conflict queues one recovery wakeup request for the assignee
- repeated scans do not create duplicate recovery requests while one is queued/running

- [ ] **Step 2: Run the focused tests**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: FAIL because no recovery wakeup is enqueued and no recovery state is stored.

- [ ] **Step 3: Add execution workspace recovery state helpers**

In `server/src/services/execution-workspaces.ts`, add focused helpers for:

- queueing recovery
- marking recovery running
- resolving recovery
- failing recovery
- escalating recovery

These helpers should only touch recovery fields and reuse the existing sync state update path where possible.

- [ ] **Step 4: Queue recovery on unresolved pre-PR and post-PR conflicts**

Update:

- `server/src/routes/approvals.ts`
- `server/src/services/heartbeat.ts`

to enqueue a single `agent_wakeup_requests` row via `heartbeat.wakeup(...)` with:

- `source: "automation"`
- `triggerDetail: "system"`
- `reason: "execution_workspace_conflict_recovery"`
- `payload.recoveryContext`

Guard this so Baton does not enqueue duplicate recovery requests for the same workspace while `recoveryStatus` is already `queued` or `running`.

- [ ] **Step 5: Re-run the focused tests**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: PASS for recovery queueing scenarios or move on to the next missing behavior.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/execution-workspaces.ts server/src/routes/approvals.ts server/src/services/heartbeat.ts server/src/__tests__/pull-request-approval.integration.test.ts
git commit -m "Queue agent recovery for conflicted workspaces"
```

### Task 3: Mark Recovery Runs and Verify Recovery Outcomes

**Files:**
- Modify: `server/src/services/heartbeat.ts`
- Modify: `server/src/services/pull-requests.ts`
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`
- Test: `server/src/__tests__/pull-requests.test.ts`

- [ ] **Step 1: Add failing tests for recovery run transitions**

Add coverage for:

- recovery wakeup creates a run that marks the workspace `running`
- successful recovery run rechecks the branch and returns workspace to `verified` or `pr_open`
- failed recovery run increments attempts and requeues once
- exhausted retries mark the workspace `escalated`

- [ ] **Step 2: Run the targeted tests**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts server/src/__tests__/pull-requests.test.ts`
Expected: FAIL because heartbeat finalization does not yet recognize recovery runs.

- [ ] **Step 3: Mark recovery runs in context and workspace state**

When heartbeat claims a recovery wakeup and starts a run:

- include `recoveryContext` in the run context snapshot
- mark the workspace `recoveryStatus = "running"`
- record `recoveryStartedAt` and `lastRecoveryRunId`

- [ ] **Step 4: Add post-run verification for recovery runs**

On run finalization in `server/src/services/heartbeat.ts`:

- detect `contextSnapshot.recoveryContext`
- if the run succeeded, call `prepareForPullRequest(...)` again
- if branch verification passes:
  - clear the failure state back to `verified` or `pr_open`
  - mark recovery `resolved`
- if verification still conflicts or the run failed:
  - requeue once if attempts are below the limit
  - otherwise mark `escalated`

- [ ] **Step 5: Keep pull-request verification logic reusable**

If needed, extract small helpers in `server/src/services/pull-requests.ts` so recovery re-verification can reuse the same branch inspection logic without duplicating git orchestration.

- [ ] **Step 6: Re-run the targeted tests**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts server/src/__tests__/pull-requests.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/heartbeat.ts server/src/services/pull-requests.ts server/src/__tests__/pull-request-approval.integration.test.ts server/src/__tests__/pull-requests.test.ts
git commit -m "Verify and resolve agent conflict recovery runs"
```

### Task 4: Surface Recovery State in API and UI

**Files:**
- Modify: `server/src/routes/issues/issue-routes.ts`
- Modify: `ui/src/components/ApprovalPayload.tsx`
- Test: `server/src/__tests__/pull-request-approval.integration.test.ts`

- [ ] **Step 1: Add failing assertions for API/UI payload shape**

Extend issue or approval test coverage so recovery metadata is expected in API responses after Baton queues or resolves recovery.

- [ ] **Step 2: Run the targeted test**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: FAIL because the recovery fields are not serialized yet.

- [ ] **Step 3: Expose recovery fields in server responses**

Update issue route serialization to include the new recovery metadata on execution workspace payloads.

- [ ] **Step 4: Render recovery state in approval payload UI**

Show:

- recovery status
- recovery reason
- recovery attempt count
- last recovery run id

Keep the UI compact and consistent with the current sync/conflict section.

- [ ] **Step 5: Re-run the targeted test**

Run: `pnpm exec vitest run server/src/__tests__/pull-request-approval.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/issues/issue-routes.ts ui/src/components/ApprovalPayload.tsx server/src/__tests__/pull-request-approval.integration.test.ts
git commit -m "Expose conflict recovery state in responses"
```

### Task 5: Full Verification and Finish Branch

**Files:**
- Modify: `doc/WORKFLOWS.md`

- [ ] **Step 1: Update workflow documentation**

Document the new recovery loop in `doc/WORKFLOWS.md` so the control-plane behavior matches the implementation.

- [ ] **Step 2: Run typecheck**

Run: `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Run migration locally**

Run: `DATABASE_URL=postgres://baton:baton@localhost:5432/baton pnpm db:migrate`
Expected: PASS with the new recovery migration applied.

- [ ] **Step 6: Commit final documentation and verification changes**

```bash
git add doc/WORKFLOWS.md
git commit -m "Document agent-driven conflict recovery"
```

- [ ] **Step 7: Finish the development branch**

Use the `finishing-a-development-branch` skill after verification passes to decide merge or PR handling.
