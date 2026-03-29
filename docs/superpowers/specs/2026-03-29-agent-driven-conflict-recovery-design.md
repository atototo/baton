# Agent-Driven Conflict Recovery Design

## Goal

When Baton detects a pre-PR conflict or post-PR drift that git cannot resolve automatically, Baton should not stop at `conflicted` or `drifted`. It should create an explicit recovery request, wake the issue's assignee agent, let that agent resolve the branch state in its execution workspace, re-run sync/verification, and only escalate to a human when the recovery loop fails.

## Scope

This design covers the next step after the existing branch sync and drift detection work:

- convert `conflicted` and `drifted` workspaces into recovery work items
- wake the original assignee agent with recovery-specific context
- prevent duplicate recovery wakeups for the same workspace
- persist recovery progress and outcomes on the execution workspace
- escalate only after bounded retry failure

It does not attempt semantic auto-merge beyond the existing git merge path, and it does not introduce stacked branch dependency planning.

## Existing Baseline

Today Baton already does the following:

- `prepareForPullRequest` merges the latest base branch into the execution branch before PR creation
- PR approval creation is blocked when that sync conflicts
- open PR workspaces are scanned for drift in heartbeat
- a drifted workspace is marked `drifted` when auto-resync fails

The remaining gap is ownership of unresolved conflicts. Baton records the failure, but nobody is automatically re-engaged to recover the branch.

## Product Decision

The primary recovery actor is the issue's current assignee agent. Baton should try that agent first because:

- the assignee owns the implementation intent
- the assignee already has the correct execution workspace
- this keeps human-in-the-loop focused on decisions, not git plumbing

If the assignee agent cannot recover the workspace after bounded retries, Baton escalates to a human with a structured explanation. Escalation to a manager/leader agent is explicitly out of scope for this slice.

## Proposed Model

Use the existing `agent_wakeup_requests` queue and heartbeat orchestration instead of building a new recovery queue table.

### Why reuse wakeup requests

- Baton already has queueing, claiming, coalescing, and run creation logic there
- recovery is operationally just another orchestrated wakeup with stricter payload semantics
- UI and logs can already reason about wakeup requests and runs

### Recovery-specific additions

Execution workspaces gain recovery metadata:

- `recoveryStatus`: `idle | queued | running | resolved | failed | escalated`
- `recoveryReason`: `pre_pr_conflict | post_pr_drift | null`
- `recoveryRequestedAt`
- `recoveryStartedAt`
- `recoveryFinishedAt`
- `recoveryAttemptCount`
- `lastRecoveryRunId`

The `agent_wakeup_requests.payload` and `heartbeat_runs.contextSnapshot` carry a `recoveryContext` object:

- `kind: "execution_workspace_conflict"`
- `executionWorkspaceId`
- `issueId`
- `reason`
- `branch`
- `baseBranch`
- `conflictedPaths`
- `lastBaseCommitSha`
- `lastBranchCommitSha`

## State Machine

### Workspace sync state

Existing sync states remain the external branch readiness state:

- `verified`
- `conflicted`
- `pr_open`
- `drifted`

### Recovery state

Recovery state tracks whether Baton is actively trying to repair the workspace:

- `idle`
- `queued`
- `running`
- `resolved`
- `failed`
- `escalated`

The key rule is that sync state and recovery state answer different questions:

- sync state: what is the branch/PR readiness right now?
- recovery state: is Baton actively trying to repair it?

## Workflow

### 1. Conflict or drift is detected

When pre-PR sync returns `conflicted` or drift resync returns `drifted`:

1. Baton persists sync metadata exactly as it does now.
2. Baton calls a new helper, `queueConflictRecovery`.
3. That helper verifies:
   - the issue still exists
   - the issue still has an assignee agent
   - the workspace is not already `recoveryStatus in (queued, running)`
4. Baton enqueues a wakeup request for the assignee with:
   - `source = "automation"`
   - `triggerDetail = "system"`
   - `reason = "execution_workspace_conflict_recovery"`
   - `payload.recoveryContext = ...`
5. Baton updates the workspace to:
   - `recoveryStatus = "queued"`
   - `recoveryReason = pre_pr_conflict | post_pr_drift`
   - `recoveryRequestedAt = now`
   - increment `recoveryAttemptCount`

### 2. Heartbeat claims the recovery wakeup

When heartbeat claims the queued wakeup and creates a run:

1. Baton updates the workspace to:
   - `recoveryStatus = "running"`
   - `recoveryStartedAt = now`
   - `lastRecoveryRunId = run.id`
2. The run context includes the recovery payload so the agent can see why it was re-invoked.

### 3. Agent performs recovery

The agent is expected to:

1. inspect conflicted files and current branch state
2. resolve the conflict in its execution workspace
3. stage and commit any required merge resolution
4. run the expected verification commands
5. leave the branch in a state where Baton can re-run sync inspection successfully

This is intentionally prompt/runtime behavior, not hard-coded merge logic in the control plane.

### 4. Baton verifies recovery after run completion

When the recovery run finishes:

1. Baton checks whether it was a recovery run via `contextSnapshot.recoveryContext`.
2. If the run failed or was cancelled:
   - mark `recoveryStatus = "failed"`
   - decide whether to requeue or escalate based on attempt count
3. If the run succeeded:
   - call `prepareForPullRequest` again against the workspace branch/base
   - if sync succeeds:
     - move sync state back to `verified` or `pr_open` depending on whether a PR is already open
     - set `recoveryStatus = "resolved"`
     - set `recoveryFinishedAt = now`
   - if sync still conflicts:
     - either requeue another recovery attempt or escalate

## Retry Policy

Use bounded retries on the execution workspace itself.

- default max attempts: `2`
- first failure: requeue once
- second failure: set `recoveryStatus = "escalated"`

This avoids infinite conflict loops while still giving the assignee one more pass after a failed run.

## Coalescing Rules

Recovery requests must be deduplicated per workspace.

Rules:

- if `recoveryStatus` is already `queued` or `running`, do not enqueue another recovery wakeup
- if a queued/running wakeup request already exists with the same `executionWorkspaceId` and `reason`, update metadata rather than enqueueing a duplicate
- post-PR drift should not create a second recovery run while pre-PR conflict recovery is already in flight for the same workspace

This keeps Baton from spamming the same assignee agent.

## Verification Rules

Control plane verification remains the final arbiter of recovery success. Agent intent alone is not enough.

Recovery is considered successful only if:

- Baton can re-run sync/resync without conflict
- the workspace records the new base/branch SHAs
- any required verification gate configured in the current PR flow passes

## Escalation Output

When retries are exhausted Baton should persist a structured escalation summary that answers:

- which workspace and issue are affected
- whether the failure started as `pre_pr_conflict` or `post_pr_drift`
- which files remained conflicted
- how many recovery attempts were made
- the latest recovery run id
- whether the run failed outright or the branch remained conflicted after agent changes

This becomes the human-facing handoff, not just a raw git failure.

## Data Model Changes

### `execution_workspaces`

Add columns:

- `recovery_status`
- `recovery_reason`
- `recovery_requested_at`
- `recovery_started_at`
- `recovery_finished_at`
- `recovery_attempt_count`
- `last_recovery_run_id`

No new table is required for V1.1.

### Shared types

Expose the recovery metadata in shared issue/execution workspace payloads so UI and approvals can display it.

## Server Changes

### `executionWorkspaceService`

Add helpers:

- `queueRecovery(...)`
- `startRecovery(...)`
- `resolveRecovery(...)`
- `failRecovery(...)`
- `escalateRecovery(...)`

### `heartbeatService`

Add recovery integration at two points:

1. when sync/drift detection hits an unresolved conflict, queue recovery
2. when a run finalizes, if it is a recovery run, verify the branch and transition the workspace

### `pullRequestService`

No new merge strategy is required. The existing `prepareForPullRequest` remains the control-plane verifier that determines whether recovery succeeded.

## UI Changes

Issue detail and approval payload should show:

- recovery status
- recovery reason
- attempt count
- last recovery run id
- escalation summary when present

This makes Baton explain what it is doing instead of silently re-running agents.

## Tests

### Unit / integration coverage

1. pre-PR conflict queues exactly one recovery wakeup for the assignee
2. drift detection queues exactly one recovery wakeup for the assignee
3. duplicate conflict scans do not enqueue duplicate recovery requests
4. recovery run success returns workspace to `verified` or `pr_open`
5. recovery run failure requeues once, then escalates
6. recovery success after PR-open drift clears `drifted`

## Rollout

This change can ship without a feature flag because it only activates when Baton already detects a conflict it cannot resolve. It is an automation improvement on top of an existing failure state rather than a change to the normal happy path.
