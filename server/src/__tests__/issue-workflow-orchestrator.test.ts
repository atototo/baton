import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  approvals,
  companies,
  companyMemberships,
  issueApprovals,
  issueWorkflowSessions,
  issues,
} from "@atototo/db";
import { issueWorkflowOrchestrator } from "../services/issue-workflow-orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PGLITE_ENTRY = path.resolve(
  REPO_ROOT,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/index.js",
);
const MIGRATIONS_FOLDER = path.resolve(REPO_ROOT, "packages/db/src/migrations");

async function applyPgliteMigrations(client: { exec: (sql: string) => Promise<unknown> }) {
  const files = (await fs.readdir(MIGRATIONS_FOLDER))
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const contents = await fs.readFile(path.join(MIGRATIONS_FOLDER, file), "utf8");
    const statements = contents
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await client.exec(statement);
    }
  }
}

describe("issue workflow orchestrator session transitions", () => {
  let db: any;

  beforeAll(async () => {
    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        agents,
        approvals,
        companies,
        companyMemberships,
        issueApprovals,
        issueWorkflowSessions,
        issues,
      },
    });
    await applyPgliteMigrations(client);
  }, 120_000);

  it("bumps the issue epoch when a workflow session requests revision and reopens the same active session", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co",
      issuePrefix: "WF",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "workflow-agent",
      role: "general",
      title: "Workflow Agent",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Needs review",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "board-user",
      issueNumber: 1,
      identifier: "WF-1",
      requestDepth: 0,
      workflowEpoch: 1,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_pull_request",
      requestedByAgentId: agentId,
      status: "pending",
      payload: {
        issueId,
        issueIdentifier: "WF-1",
      },
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId,
      approvalId,
      issueWorkflowEpoch: 1,
      kind: "pull_request",
      status: "open",
      fingerprint: `${issueId}:pull_request:no-workspace:no-branch:no-base`,
      requestedByAgentId: agentId,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await orchestrator.requestRevisionForApproval({
      approvalId,
      reopenSignal: "revision_requested",
    });

    const updatedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    const updatedSession = await db
      .select()
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(updatedIssue.workflowEpoch).toBe(2);
    expect(updatedIssue.activeWorkflowSessionId).toBe(sessionId);
    expect(updatedSession.status).toBe("revision_requested");
    expect(updatedSession.reopenSignal).toBe("revision_requested");
  });

  it("reopens the same session on resubmit without incrementing the issue epoch", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 2",
      issuePrefix: "WG",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "workflow-agent-2",
      role: "general",
      title: "Workflow Agent 2",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Resubmit review",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 1,
      identifier: "WG-1",
      requestDepth: 0,
      workflowEpoch: 3,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: agentId,
      status: "revision_requested",
      payload: {
        issueId,
        issueIdentifier: "WG-1",
      },
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId,
      approvalId,
      issueWorkflowEpoch: 3,
      kind: "push_to_existing_pr",
      status: "revision_requested",
      fingerprint: `${issueId}:push_to_existing_pr:no-workspace:no-branch:no-base`,
      requestedByAgentId: agentId,
      reopenSignal: "revision_requested",
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await orchestrator.resubmitApprovalSession({
      approvalId,
    });

    const updatedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    const updatedSession = await db
      .select()
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(updatedIssue.workflowEpoch).toBe(3);
    expect(updatedIssue.activeWorkflowSessionId).toBe(sessionId);
    expect(updatedSession.status).toBe("open");
    expect(updatedSession.reopenSignal).toBe("resubmitted");
  });

  it("rejects starting a new handoff when the same fingerprint was already consumed in the current epoch", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const consumedApprovalId = randomUUID();
    const consumedSessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 3",
      issuePrefix: "WH",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Consumed handoff issue",
      status: "in_progress",
      priority: "medium",
      issueNumber: 1,
      identifier: "WH-1",
      requestDepth: 0,
      workflowEpoch: 2,
    });
    await db.insert(approvals).values({
      id: consumedApprovalId,
      companyId,
      type: "approve_push_to_existing_pr",
      status: "approved",
      payload: {
        issueId,
        issueIdentifier: "WH-1",
      },
    });
    await db.insert(issueWorkflowSessions).values({
      id: consumedSessionId,
      companyId,
      issueId,
      approvalId: consumedApprovalId,
      issueWorkflowEpoch: 2,
      kind: "push_to_existing_pr",
      status: "consumed",
      fingerprint: `${issueId}:push_to_existing_pr:no-workspace:feature/wh-1:main`,
      branch: "feature/wh-1",
      baseBranch: "main",
      commitSha: "abc123",
      gitSideEffectState: "succeeded",
      consumedAt: new Date(),
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.beginApprovalHandoff({
        companyId,
        issueId,
        currentWorkflowEpoch: 2,
        kind: "push_to_existing_pr",
        executionWorkspaceId: null,
        branch: "feature/wh-1",
        baseBranch: "main",
        source: "issue.review_handoff",
      }),
    ).rejects.toThrow(/already consumed/i);
  });

  it("bumps the issue epoch when opening a new approval handoff", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 4",
      issuePrefix: "WI",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Fresh handoff issue",
      status: "in_progress",
      priority: "medium",
      issueNumber: 1,
      identifier: "WI-1",
      requestDepth: 0,
      workflowEpoch: 4,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    const result = await orchestrator.beginApprovalHandoff({
      companyId,
      issueId,
      currentWorkflowEpoch: 4,
      kind: "pull_request",
      executionWorkspaceId: null,
      branch: "feature/wi-1",
      baseBranch: "main",
      source: "issue.review_handoff",
    });

    const updatedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    expect(result.issueWorkflowEpoch).toBe(5);
    expect(result.fingerprint).toBe(`${issueId}:pull_request:no-workspace:feature/wi-1:main`);
    expect(updatedIssue.workflowEpoch).toBe(5);
  });

  it("rejects stale agent mutation ownership when workflow moved to another assignee", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const currentAgentId = randomUUID();
    const staleAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 5",
      issuePrefix: "WK",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values([
      {
        id: currentAgentId,
        companyId,
        name: "current-agent",
        role: "general",
        title: "Current Agent",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: staleAgentId,
        companyId,
        name: "stale-agent",
        role: "general",
        title: "Stale Agent",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Workflow-owned issue",
      status: "in_review",
      priority: "medium",
      assigneeAgentId: currentAgentId,
      issueNumber: 1,
      identifier: "WK-1",
      requestDepth: 0,
      workflowEpoch: 3,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    const guard = await orchestrator.evaluateAgentMutationAuthority({
      issueId,
      companyId,
      actorAgentId: staleAgentId,
    });

    expect(guard).toEqual({
      allowed: false,
      reason: "workflow_advanced",
      statusCode: 409,
      message: "Issue workflow has advanced. This agent run is no longer the active owner for mutations.",
    });
  });

  it("rewrites child assignee done attempt to in_review and parent assignee", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 6",
      issuePrefix: "WL",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: "leader-agent",
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: "child-agent",
        role: "general",
        title: "Child",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        issueNumber: 1,
        identifier: "WL-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: childAgentId,
        issueNumber: 2,
        identifier: "WL-2",
        requestDepth: 1,
      },
    ]);

    const orchestrator = issueWorkflowOrchestrator(db);
    const result = await orchestrator.normalizeAgentWorkflowPatch({
      issueId: childId,
      actorType: "agent",
      actorAgentId: childAgentId,
      patch: { status: "done" },
    });

    expect(result).toEqual({
      patch: {
        status: "in_review",
        assigneeAgentId: leaderAgentId,
        assigneeUserId: null,
      },
      workflowForcedAssigneeChange: true,
    });
  });

  it("blocks top-level assignee done attempt while direct child issues are still active", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const leaderAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 7",
      issuePrefix: "WM",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "leader-agent-2",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        issueNumber: 1,
        identifier: "WM-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child",
        status: "in_progress",
        priority: "medium",
        issueNumber: 2,
        identifier: "WM-2",
        requestDepth: 1,
      },
    ]);

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.normalizeAgentWorkflowPatch({
        issueId: parentId,
        actorType: "agent",
        actorAgentId: leaderAgentId,
        patch: { status: "done" },
      }),
    ).rejects.toThrow(/direct child issues are still active/i);
  });

  it("applies a workflow-aware patch for an agent returning a top-level issue to board review", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const assigneeAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 7B",
      issuePrefix: "WMB",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "board-user",
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: assigneeAgentId,
      companyId,
      name: "leader-agent-3",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Top-level issue",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId,
      createdByUserId: "board-user",
      issueNumber: 1,
      identifier: "WMB-1",
      requestDepth: 0,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    const result = await orchestrator.applyWorkflowAwareIssuePatch({
      issueId,
      companyId,
      actorType: "agent",
      actorAgentId: assigneeAgentId,
      requestedPatch: { status: "done" },
    });

    expect(result.hasFieldMutations).toBe(true);
    expect(result.workflowForcedAssigneeChange).toBe(true);
    expect(result.assigneeWillChange).toBe(true);
    expect(result.isAgentReturningIssueToCreator).toBe(true);
    expect(result.updateFields).toEqual({
      status: "in_review",
      assigneeAgentId: null,
      assigneeUserId: "board-user",
    });
    expect(result.previous).toEqual({
      status: "in_progress",
      assigneeAgentId,
      assigneeUserId: null,
    });
    expect(result.issue?.status).toBe("in_review");
    expect(result.issue?.assigneeAgentId).toBeNull();
    expect(result.issue?.assigneeUserId).toBe("board-user");
  });

  it("skips manual assignment callbacks when the assignee change is workflow-forced", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const parentAgentId = randomUUID();
    const childAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 7C",
      issuePrefix: "WMC",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values([
      {
        id: parentAgentId,
        companyId,
        name: "leader-agent-4",
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: "child-agent-2",
        role: "general",
        title: "Child",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: parentAgentId,
        issueNumber: 1,
        identifier: "WMC-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: childAgentId,
        issueNumber: 2,
        identifier: "WMC-2",
        requestDepth: 1,
      },
    ]);

    let assignCheckCalls = 0;
    let parentPlanCheckCalls = 0;
    const orchestrator = issueWorkflowOrchestrator(db);
    const result = await orchestrator.applyWorkflowAwareIssuePatch({
      issueId: childId,
      companyId,
      actorType: "agent",
      actorAgentId: childAgentId,
      requestedPatch: { status: "done" },
      assertCanAssign: async () => {
        assignCheckCalls += 1;
      },
      assertParentPlanApprovedBeforeDelegation: async () => {
        parentPlanCheckCalls += 1;
      },
    });

    expect(result.workflowForcedAssigneeChange).toBe(true);
    expect(result.assigneeWillChange).toBe(true);
    expect(assignCheckCalls).toBe(0);
    expect(parentPlanCheckCalls).toBe(0);
    expect(result.updateFields).toEqual({
      status: "in_review",
      assigneeAgentId: parentAgentId,
      assigneeUserId: null,
    });
  });

  it("blocks in_review transition when an agent question is still pending", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 8",
      issuePrefix: "WN",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Question-blocked issue",
      status: "in_progress",
      priority: "medium",
      issueNumber: 1,
      identifier: "WN-1",
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "agent_question",
      status: "pending",
      payload: {
        issueId,
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.assertInReviewTransitionAllowed({
        issueId,
        companyId,
      }),
    ).rejects.toThrow(/agent question is pending/i);
  });

  it("blocks in_review transition when direct child issues are still active", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 9",
      issuePrefix: "WO",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent review issue",
        status: "in_progress",
        priority: "medium",
        issueNumber: 1,
        identifier: "WO-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child still active",
        status: "in_progress",
        priority: "medium",
        issueNumber: 2,
        identifier: "WO-2",
        requestDepth: 1,
      },
    ]);

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.assertInReviewTransitionAllowed({
        issueId: parentId,
        companyId,
      }),
    ).rejects.toThrow(/child issues are still active/i);
  });

  it("plans parent board handoff after the last child review completes", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const siblingId = randomUUID();
    const leaderAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 10",
      issuePrefix: "WP",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "leader-agent-3",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent",
        status: "todo",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 1,
        identifier: "WP-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child in review",
        status: "done",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 2,
        identifier: "WP-2",
        requestDepth: 1,
      },
      {
        id: siblingId,
        companyId,
        parentId,
        title: "Sibling done",
        status: "done",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 3,
        identifier: "WP-3",
        requestDepth: 1,
      },
    ]);

    const orchestrator = issueWorkflowOrchestrator(db);
    const plan = await orchestrator.planParentBoardReviewAdvance({
      completedIssueId: childId,
      previousStatus: "in_review",
      nextStatus: "done",
      actorType: "agent",
      actorAgentId: leaderAgentId,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        parentIssueId: parentId,
        parentPatch: {
          status: "in_review",
          assigneeAgentId: null,
          assigneeUserId: "board-user",
        },
      }),
    );
    expect(plan?.summary).toContain("## 리뷰 완료");
    expect(plan?.summary).toContain("WP-2");
    expect(plan?.summary).toContain("WP-3");
  });

  it("applies parent board handoff update after the last child review completes", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const siblingId = randomUUID();
    const leaderAgentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 11",
      issuePrefix: "WQ",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "board-user",
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "leader-agent-4",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent",
        status: "todo",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 1,
        identifier: "WQ-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child in review",
        status: "done",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 2,
        identifier: "WQ-2",
        requestDepth: 1,
      },
      {
        id: siblingId,
        companyId,
        parentId,
        title: "Sibling done",
        status: "done",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: "board-user",
        issueNumber: 3,
        identifier: "WQ-3",
        requestDepth: 1,
      },
    ]);

    const orchestrator = issueWorkflowOrchestrator(db);
    const result = await orchestrator.advanceParentAfterChildReviewCompletion({
      completedIssueId: childId,
      previousStatus: "in_review",
      nextStatus: "done",
      actorType: "agent",
      actorAgentId: leaderAgentId,
    });

    expect(result?.updatedParent).toEqual(
      expect.objectContaining({
        id: parentId,
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: "board-user",
      }),
    );
    expect(result?.summary).toContain("## 리뷰 완료");
  });

  it("rolls an issue back when board review handoff fails after the update was applied", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const agentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 12",
      issuePrefix: "WR",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "board-user",
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "roll-back-agent",
      role: "general",
      title: "Rollback Agent",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Rollback issue",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 1,
      identifier: "WR-1",
      requestDepth: 0,
    });

    const orchestrator = issueWorkflowOrchestrator(db);

    await expect(
      orchestrator.updateIssueWithBoardReviewRollback({
        issueId,
        patch: {
          status: "in_review",
          assigneeAgentId: null,
          assigneeUserId: "board-user",
        },
        existingSnapshot: {
          status: "in_progress",
          assigneeAgentId: agentId,
          assigneeUserId: null,
        },
        shouldRollback: true,
        afterUpdate: async () => {
          throw new Error("synthetic board review failure");
        },
      }),
    ).rejects.toThrow(/synthetic board review failure/);

    const reloadedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    expect(reloadedIssue).toEqual(
      expect.objectContaining({
        status: "in_progress",
        assigneeAgentId: agentId,
        assigneeUserId: null,
      }),
    );
  });

  it("blocks checkout when issue plan approval is pending", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 13",
      issuePrefix: "WS",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Blocked checkout issue",
      status: "todo",
      priority: "medium",
      issueNumber: 1,
      identifier: "WS-1",
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_issue_plan",
      status: "pending",
      payload: { issueId },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.assertIssueExecutionAllowed({
        issueId,
        companyId,
        reason: "checkout",
      }),
    ).rejects.toThrow(/Cannot start work while issue plan approval is pending/);
  });

  it("blocks checkout when a parent issue plan approval is pending", async () => {
    const companyId = randomUUID();
    const parentId = randomUUID();
    const childId = randomUUID();
    const approvalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 14",
      issuePrefix: "WT",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent",
        status: "todo",
        priority: "medium",
        issueNumber: 1,
        identifier: "WT-1",
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child",
        status: "todo",
        priority: "medium",
        issueNumber: 2,
        identifier: "WT-2",
        requestDepth: 1,
      },
    ]);
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_issue_plan",
      status: "pending",
      payload: { issueId: parentId },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.assertAncestorExecutionAllowed({
        issueId: childId,
        companyId,
        reason: "checkout",
      }),
    ).rejects.toThrow(/Cannot start work while parent issue plan approval is pending/);
  });

  it("blocks done transition while PR-related approval is pending", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 15",
      issuePrefix: "WU",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Completion-blocked issue",
      status: "in_progress",
      priority: "medium",
      issueNumber: 1,
      identifier: "WU-1",
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      status: "revision_requested",
      payload: { issueId },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    await expect(
      orchestrator.assertIssueCompletionAllowed({
        issueId,
        companyId,
      }),
    ).rejects.toThrow(/Cannot mark issue done while approval is pending/);
  });

  it("prepares a top-level agent return-to-board patch with workflow metadata", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 16",
      issuePrefix: "WV",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: "board-user",
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "handoff-agent",
      role: "general",
      title: "Handoff Agent",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Needs board review",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: agentId,
      createdByUserId: "board-user",
      issueNumber: 1,
      identifier: "WV-1",
      requestDepth: 0,
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    const prepared = await orchestrator.prepareIssuePatchUpdate({
      issueId,
      companyId,
      actorType: "agent",
      actorAgentId: agentId,
      requestedPatch: {
        status: "done",
      },
    });

    expect(prepared.patch).toEqual({
      status: "in_review",
      assigneeAgentId: null,
      assigneeUserId: "board-user",
    });
    expect(prepared.assigneeWillChange).toBe(true);
    expect(prepared.requestedAssigneeWillChange).toBe(false);
    expect(prepared.workflowForcedAssigneeChange).toBe(true);
    expect(prepared.isAgentReturningIssueToCreator).toBe(true);
  });

  it("attaches an approval-backed workflow session using issue and approval metadata", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const executionWorkspaceId = randomUUID();
    const requestRunId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Workflow Co 17",
      issuePrefix: "WW",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "session-agent",
      role: "general",
      title: "Session Agent",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Existing PR issue",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "board-user",
      issueNumber: 1,
      identifier: "WW-1",
      requestDepth: 0,
      workflowEpoch: 5,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: agentId,
      status: "pending",
      payload: {
        issueId,
        issueIdentifier: "WW-1",
        branch: "feature/ww-1",
        baseBranch: "main",
      },
    });

    const orchestrator = issueWorkflowOrchestrator(db);
    const session = await orchestrator.attachApprovalWorkflowSession({
      companyId,
      issue: {
        id: issueId,
        workflowEpoch: 5,
        executionWorkspaceId,
      },
      approval: {
        id: approvalId,
        type: "approve_push_to_existing_pr",
        requestedByAgentId: agentId,
        requestedByUserId: null,
        payload: {
          branch: "feature/ww-1",
          baseBranch: "main",
        },
      },
      requestRunId,
      source: "approval.create",
    });

    expect(session).toEqual(
      expect.objectContaining({
        approvalId,
        issueId,
        kind: "push_to_existing_pr",
        issueWorkflowEpoch: 5,
        branch: "feature/ww-1",
        baseBranch: "main",
      }),
    );

    const updatedIssue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    expect(updatedIssue.activeWorkflowSessionId).toBe(session?.id ?? null);
  });
});
