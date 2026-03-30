import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  approvals,
  companies,
  companyMemberships,
  executionWorkspaces,
  heartbeatRuns,
  issueApprovals,
  issueComments,
  issueWorkflowSessions,
  issues,
} from "@atototo/db";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { createApp } from "../app.js";
import { approvalService, executionWorkspaceService, issueApprovalService, issueService, projectService } from "../services/index.js";
import { findOrCreateLinkedApproval } from "../routes/issues/approval-helpers.js";
import type { StorageService } from "../storage/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PGLITE_ENTRY = path.resolve(
  REPO_ROOT,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/index.js",
);
const MIGRATIONS_FOLDER = path.resolve(REPO_ROOT, "packages/db/src/migrations");

const storageStub: StorageService = {
  provider: "local_disk",
  async putFile() {
    throw new Error("storage not used in this test");
  },
  async getObject() {
    throw new Error("storage not used in this test");
  },
  async headObject() {
    return { exists: false };
  },
  async deleteObject() {
    // no-op
  },
};

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

function createIdentifier(prefix: string, issueNumber: number) {
  return `${prefix}-${issueNumber}`;
}

describe("review-governed workflow transitions", () => {
  let tempRoot = "";
  let previousBatonHome: string | undefined;
  let previousJwtSecret: string | undefined;
  let db: any;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-review-governed-"));

    previousBatonHome = process.env.BATON_HOME;
    process.env.BATON_HOME = path.join(tempRoot, ".baton-home");

    previousJwtSecret = process.env.BATON_AGENT_JWT_SECRET;
    process.env.BATON_AGENT_JWT_SECRET = "test-agent-jwt-secret";

    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        agents,
        approvals,
        companies,
        companyMemberships,
        executionWorkspaces,
        heartbeatRuns,
        issueApprovals,
        issueWorkflowSessions,
        issues,
      },
    });
    await applyPgliteMigrations(client);

    app = await createApp(db, {
      uiMode: "none",
      storageService: storageStub,
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      allowedHostnames: [],
      bindHost: "127.0.0.1",
      authReady: true,
      companyDeletionEnabled: true,
    });
  }, 120_000);

  afterAll(async () => {
    if (previousBatonHome === undefined) delete process.env.BATON_HOME;
    else process.env.BATON_HOME = previousBatonHome;
    if (previousJwtSecret === undefined) delete process.env.BATON_AGENT_JWT_SECRET;
    else process.env.BATON_AGENT_JWT_SECRET = previousJwtSecret;
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rewrites child assignee done transition to in_review and reassigns to parent assignee", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();
    const childRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: `leader-${leaderAgentId.slice(0, 8)}`,
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: `dev-${childAgentId.slice(0, 8)}`,
        role: "engineer",
        title: "Developer",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(heartbeatRuns).values({
      id: childRunId,
      companyId,
      agentId: childAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent implementation issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 1,
        identifier: createIdentifier(issuePrefix, 1),
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child implementation issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: childAgentId,
        checkoutRunId: childRunId,
        executionRunId: childRunId,
        createdByUserId: reviewerUserId,
        issueNumber: 2,
        identifier: createIdentifier(issuePrefix, 2),
        requestDepth: 1,
      },
    ]);

    const childToken = createLocalAgentJwt(childAgentId, companyId, "codex_local", childRunId);
    expect(childToken).toBeTruthy();

    const response = await request(app)
      .patch(`/api/issues/${childId}`)
      .set("Authorization", `Bearer ${childToken}`)
      .set("x-baton-run-id", childRunId)
      .send({ status: "done" })
      .expect(200);

    expect(response.body.status).toBe("in_review");
    expect(response.body.assigneeAgentId).toBe(leaderAgentId);
    expect(response.body.assigneeUserId).toBeNull();
  });

  it("rewrites child assignee direct in_review transition to reviewer reassignment", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();
    const childRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: `leader-${leaderAgentId.slice(0, 8)}`,
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: `dev-${childAgentId.slice(0, 8)}`,
        role: "engineer",
        title: "Developer",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(heartbeatRuns).values({
      id: childRunId,
      companyId,
      agentId: childAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });

    const parentId = randomUUID();
    const childId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent implementation issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 1,
        identifier: createIdentifier(issuePrefix, 1),
        requestDepth: 0,
      },
      {
        id: childId,
        companyId,
        parentId,
        title: "Child implementation issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: childAgentId,
        checkoutRunId: childRunId,
        executionRunId: childRunId,
        createdByUserId: reviewerUserId,
        issueNumber: 2,
        identifier: createIdentifier(issuePrefix, 2),
        requestDepth: 1,
      },
    ]);

    const childToken = createLocalAgentJwt(childAgentId, companyId, "codex_local", childRunId);
    expect(childToken).toBeTruthy();

    const response = await request(app)
      .patch(`/api/issues/${childId}`)
      .set("Authorization", `Bearer ${childToken}`)
      .set("x-baton-run-id", childRunId)
      .send({ status: "in_review" })
      .expect(200);

    expect(response.body.status).toBe("in_review");
    expect(response.body.assigneeAgentId).toBe(leaderAgentId);
    expect(response.body.assigneeUserId).toBeNull();
  });

  it("rejects top-level parent done transition while non-terminal direct children exist", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: `leader-${leaderAgentId.slice(0, 8)}`,
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: `dev-${childAgentId.slice(0, 8)}`,
        role: "engineer",
        title: "Developer",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });

    const parentId = randomUUID();
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent implementation issue",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        checkoutRunId: leaderRunId,
        executionRunId: leaderRunId,
        createdByUserId: reviewerUserId,
        issueNumber: 1,
        identifier: createIdentifier(issuePrefix, 1),
        requestDepth: 0,
      },
      {
        id: randomUUID(),
        companyId,
        parentId,
        title: "Child in progress",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: childAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 2,
        identifier: createIdentifier(issuePrefix, 2),
        requestDepth: 1,
      },
    ]);

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    const response = await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "done" });

    expect([409, 422]).toContain(response.status);
    const parent = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, parentId))
      .then((rows) => rows[0]);
    expect(parent?.status).toBe("in_progress");
  });

  it("rewrites top-level parent done transition to in_review, assigns to creator, and creates pending approve_pull_request", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: `leader-${leaderAgentId.slice(0, 8)}`,
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: `dev-${childAgentId.slice(0, 8)}`,
        role: "engineer",
        title: "Developer",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });

    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent implementation issue",
        description: "Implementation completed; requesting review handoff.",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        checkoutRunId: leaderRunId,
        executionRunId: leaderRunId,
        executionWorkspaceId,
        createdByUserId: reviewerUserId,
        issueNumber: 1,
        identifier: createIdentifier(issuePrefix, 1),
        requestDepth: 0,
      },
      {
        id: randomUUID(),
        companyId,
        parentId,
        title: "Child done",
        status: "done",
        priority: "medium",
        assigneeAgentId: childAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 2,
        identifier: createIdentifier(issuePrefix, 2),
        requestDepth: 1,
      },
      {
        id: randomUUID(),
        companyId,
        parentId,
        title: "Child cancelled",
        status: "cancelled",
        priority: "medium",
        assigneeAgentId: childAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 3,
        identifier: createIdentifier(issuePrefix, 3),
        requestDepth: 1,
      },
    ]);

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    const response = await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "done" })
      .expect(200);

    expect(response.body.status).toBe("in_review");
    expect(response.body.assigneeAgentId).toBeNull();
    expect(response.body.assigneeUserId).toBe(reviewerUserId);

    const linkedApprovals = await db
      .select({
        type: approvals.type,
        status: approvals.status,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_pull_request",
          status: "pending",
        }),
      ]),
    );
  });

  it("uses the parent execution workspace branch when creating pull request approval from board handoff", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: "AZAK-017",
      branch: "feature/AZAK-017",
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent implementation issue",
      description: "Implementation completed; requesting review handoff.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    const approvedPlanApprovalId = randomUUID();
    await db.insert(approvals).values({
      id: approvedPlanApprovalId,
      companyId,
      type: "approve_issue_plan",
      requestedByAgentId: leaderAgentId,
      decidedByUserId: reviewerUserId,
      status: "approved",
      payload: {
        issueIdentifier: createIdentifier(issuePrefix, 1),
        workspace: {
          ownerIssueId: parentId,
          ticketKey: "AZAK-017",
          branch: "feature/AZAK-017",
          baseBranch: "main",
        },
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId: approvedPlanApprovalId,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({
        status: "done",
        comment: "리뷰 완료. feature/AZAK-016 브랜치에서 정리된 커밋을 참고했습니다.",
      })
      .expect(200);

    const linkedApprovals = await db
      .select({
        type: approvals.type,
        status: approvals.status,
        payload: approvals.payload,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_pull_request",
          status: "pending",
          payload: expect.objectContaining({
            branch: "feature/AZAK-017",
            baseBranch: "main",
          }),
        }),
      ]),
    );
  });

  it("creates approve_push_to_existing_pr when the execution workspace already has an open pull request", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: "AZAK-018",
      branch: "feature/AZAK-018",
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
      pullRequestUrl: "https://github.com/example/repo/pull/11",
      pullRequestNumber: "11",
      prOpenedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent follow-up issue",
      description: "Existing PR follow-up completed; requesting board review.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    const approvedPlanApprovalId = randomUUID();
    await db.insert(approvals).values({
      id: approvedPlanApprovalId,
      companyId,
      type: "approve_issue_plan",
      requestedByAgentId: leaderAgentId,
      decidedByUserId: reviewerUserId,
      status: "approved",
      payload: {
        issueIdentifier: createIdentifier(issuePrefix, 1),
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId: approvedPlanApprovalId,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "done", comment: "기존 PR #11에 대한 follow-up 보정 완료." })
      .expect(200);

    const linkedApprovals = await db
      .select({
        type: approvals.type,
        status: approvals.status,
        payload: approvals.payload,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_push_to_existing_pr",
          status: "pending",
          payload: expect.objectContaining({
            branch: "feature/AZAK-018",
            baseBranch: "main",
          }),
        }),
      ]),
    );
  });

  it("reassigns a board-held issue back to the requesting agent when an agent_question is answered", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const issuePrefix = `AQ${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Agent Question ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent follow-up issue",
      description: "Need clarification before re-handoff.",
      status: "in_review",
      priority: "medium",
      assigneeUserId: reviewerUserId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "agent_question",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        question: "수정 요청에서 반영해야 할 구체 수정 항목을 알려주세요.",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId: parentId,
      issueWorkflowEpoch: 0,
      kind: "agent_question",
      status: "open",
      fingerprint: [parentId, "agent_question", "no-workspace", "no-branch", "no-base"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
    });

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({
        decidedByUserId: reviewerUserId,
        decisionNote: "기존 PR 업데이트 승인 흐름으로 다시 제출하세요.",
      })
      .expect(200);

    const updatedIssue = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        workflowEpoch: issues.workflowEpoch,
      })
      .from(issues)
      .where(eq(issues.id, parentId))
      .then((rows) => rows[0]);

    expect(updatedIssue).toEqual(
      expect.objectContaining({
        status: "in_progress",
        assigneeAgentId: leaderAgentId,
        assigneeUserId: null,
        workflowEpoch: 1,
      }),
    );

    const comments = await db
      .select({ body: issueComments.body })
      .from(issueComments)
      .where(eq(issueComments.issueId, parentId));

    expect(comments.some((comment) => comment.body.includes("## 에이전트 질문 답변"))).toBe(true);

    const updatedSession = await db
      .select({
        status: issueWorkflowSessions.status,
        gitSideEffectState: issueWorkflowSessions.gitSideEffectState,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(updatedSession).toEqual(
      expect.objectContaining({
        status: "consumed",
        gitSideEffectState: "succeeded",
      }),
    );
  });

  it("reopens the same workflow session across request-revision and agent resubmit", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RS${Date.now().toString().slice(-5)}`;
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Revision Session ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Workflow revision issue",
      description: "Needs revision and resubmit",
      status: "in_review",
      priority: "medium",
      assigneeUserId: reviewerUserId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 1,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        issueId,
        issueIdentifier: createIdentifier(issuePrefix, 1),
        branch: `feature/${createIdentifier(issuePrefix, 1)}`,
        baseBranch: "main",
        pullRequestUrl: "https://github.com/example/repo/pull/11",
        pullRequestNumber: "11",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId,
      issueWorkflowEpoch: 1,
      kind: "push_to_existing_pr",
      status: "open",
      fingerprint: [issueId, "push_to_existing_pr", "no-workspace", "feature/test", "main"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
    });

    await request(app)
      .post(`/api/approvals/${approvalId}/request-revision`)
      .send({
        decidedByUserId: reviewerUserId,
        decisionNote: "커밋 설명을 보강해서 다시 올려주세요.",
      })
      .expect(200);

    const issueAfterRevision = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        workflowEpoch: issues.workflowEpoch,
        activeWorkflowSessionId: issues.activeWorkflowSessionId,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    const sessionAfterRevision = await db
      .select({
        status: issueWorkflowSessions.status,
        reopenSignal: issueWorkflowSessions.reopenSignal,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(issueAfterRevision).toEqual(
      expect.objectContaining({
        status: "in_progress",
        assigneeAgentId: leaderAgentId,
        assigneeUserId: null,
        workflowEpoch: 2,
        activeWorkflowSessionId: sessionId,
      }),
    );
    expect(sessionAfterRevision).toEqual(
      expect.objectContaining({
        status: "revision_requested",
        reopenSignal: "revision_requested",
      }),
    );

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .post(`/api/approvals/${approvalId}/resubmit`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({})
      .expect(200);

    const issueAfterResubmit = await db
      .select({
        workflowEpoch: issues.workflowEpoch,
        activeWorkflowSessionId: issues.activeWorkflowSessionId,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    const approvalAfterResubmit = await db
      .select({
        status: approvals.status,
      })
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .then((rows) => rows[0]);
    const sessionAfterResubmit = await db
      .select({
        status: issueWorkflowSessions.status,
        reopenSignal: issueWorkflowSessions.reopenSignal,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(issueAfterResubmit).toEqual(
      expect.objectContaining({
        workflowEpoch: 2,
        activeWorkflowSessionId: sessionId,
      }),
    );
    expect(approvalAfterResubmit?.status).toBe("pending");
    expect(sessionAfterResubmit).toEqual(
      expect.objectContaining({
        status: "open",
        reopenSignal: "resubmitted",
      }),
    );
  });

  it("keeps rejection successful even when requester wakeup cannot run and resumes the issue timeline", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const issuePrefix = `RJ${Date.now().toString().slice(-5)}`;
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Reject Session ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Rejected issue",
      description: "Blocked on board response",
      status: "blocked",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 4,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_pull_request",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        issueId,
        issueIdentifier: createIdentifier(issuePrefix, 1),
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId,
      issueWorkflowEpoch: 4,
      kind: "pull_request",
      status: "open",
      fingerprint: [issueId, "pull_request", "no-workspace", "no-branch", "no-base"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
    });

    await request(app)
      .post(`/api/approvals/${approvalId}/reject`)
      .send({
        decidedByUserId: reviewerUserId,
        decisionNote: "이 PR 방향은 보류하세요.",
      })
      .expect(200);

    const updatedIssue = await db
      .select({
        status: issues.status,
        workflowEpoch: issues.workflowEpoch,
        activeWorkflowSessionId: issues.activeWorkflowSessionId,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);
    const updatedSession = await db
      .select({
        status: issueWorkflowSessions.status,
        reopenSignal: issueWorkflowSessions.reopenSignal,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(updatedIssue).toEqual(
      expect.objectContaining({
        status: "in_progress",
        workflowEpoch: 5,
        activeWorkflowSessionId: null,
      }),
    );
    expect(updatedSession).toEqual(
      expect.objectContaining({
        status: "rejected",
        reopenSignal: "board_rejected",
      }),
    );
  });

  it("resumes requester-owned orchestration after approve_issue_plan is approved", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const issuePrefix = `PL${Date.now().toString().slice(-5)}`;
    const issueId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Plan Resume ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Parent plan issue",
      description: "Waiting for plan approval",
      status: "in_review",
      priority: "medium",
      assigneeUserId: reviewerUserId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 0,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_issue_plan",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        title: "Parent plan issue",
        issueIdentifier: createIdentifier(issuePrefix, 1),
        summary: "계획 승인 후 구현 orchestration을 이어갑니다.",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId,
      issueWorkflowEpoch: 0,
      kind: "issue_plan",
      status: "open",
      fingerprint: [issueId, "issue_plan", "no-workspace", "no-branch", "no-base"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
    });

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({
        decidedByUserId: reviewerUserId,
      })
      .expect(200);

    const updatedIssue = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
        workflowEpoch: issues.workflowEpoch,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0]);

    expect(updatedIssue).toEqual(
      expect.objectContaining({
        status: "in_progress",
        assigneeAgentId: leaderAgentId,
        assigneeUserId: null,
        workflowEpoch: 1,
      }),
    );

    const updatedSession = await db
      .select({
        status: issueWorkflowSessions.status,
        gitSideEffectState: issueWorkflowSessions.gitSideEffectState,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.id, sessionId))
      .then((rows) => rows[0]);

    expect(updatedSession).toEqual(
      expect.objectContaining({
        status: "consumed",
        gitSideEffectState: "succeeded",
      }),
    );
  });

  it("unlinks obsolete revision-requested pull request approval before creating existing-pr update approval", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `AQ${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();
    const oldApprovalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Obsolete Approval ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
      pullRequestUrl: "https://github.com/example/repo/pull/11",
      pullRequestNumber: "11",
      prOpenedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent follow-up issue",
      description: "Existing PR update completed; requesting board handoff.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: oldApprovalId,
      companyId,
      type: "approve_pull_request",
      requestedByAgentId: leaderAgentId,
      decidedByUserId: reviewerUserId,
      status: "revision_requested",
      payload: {
        title: "Old PR approval",
        issueIdentifier: createIdentifier(issuePrefix, 1),
        branch: `feature/${createIdentifier(issuePrefix, 1)}`,
        baseBranch: "main",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId: oldApprovalId,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: reviewerUserId,
        comment: "기존 PR 업데이트 승인으로 다시 제출합니다.",
      })
      .expect(200);

    const linkedApprovals = await db
      .select({
        approvalId: issueApprovals.approvalId,
        type: approvals.type,
        status: approvals.status,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_push_to_existing_pr",
          status: "pending",
        }),
      ]),
    );
    expect(linkedApprovals.some((approval) => approval.approvalId === oldApprovalId)).toBe(false);
  });

  it("unlinks stale approved existing-pr approval without commit metadata before re-requesting push approval", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `AQ${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();
    const oldApprovalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Stale Existing PR Approval ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
      pullRequestUrl: "https://github.com/example/repo/pull/11",
      pullRequestNumber: "11",
      prOpenedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent follow-up issue",
      description: "Existing PR update must be re-requested after stale approved approval.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });
    await db.insert(approvals).values({
      id: oldApprovalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: leaderAgentId,
      decidedByUserId: reviewerUserId,
      status: "approved",
      payload: {
        title: "Stale existing PR update approval",
        issueIdentifier: createIdentifier(issuePrefix, 1),
        branch: `feature/${createIdentifier(issuePrefix, 1)}`,
        baseBranch: "main",
        // Legacy/stale approval: commit metadata is missing.
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId: oldApprovalId,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: reviewerUserId,
        comment: "기존 PR 업데이트 승인을 다시 제출합니다.",
      })
      .expect(200);

    const linkedApprovals = await db
      .select({
        approvalId: issueApprovals.approvalId,
        type: approvals.type,
        status: approvals.status,
        payload: approvals.payload,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_push_to_existing_pr",
          status: "pending",
          payload: expect.objectContaining({
            branch: `feature/${createIdentifier(issuePrefix, 1)}`,
            baseBranch: "main",
          }),
        }),
      ]),
    );
    expect(linkedApprovals.some((approval) => approval.approvalId === oldApprovalId)).toBe(false);
  });

  it("creates a workflow session when a top-level review handoff opens a pull request approval", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `WS${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Workflow Session ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Top-level implementation issue",
      description: "Implementation finished; opening a PR for review.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "done" })
      .expect(200);

    const sessions = await db
      .select()
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.issueId, parentId));

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        issueId: parentId,
        issueWorkflowEpoch: 1,
        kind: "pull_request",
        status: "open",
      }),
    );
  });

  it("rejects stale existing-pr handoff replay after the workflow session was already consumed", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `WS${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();
    const approvalId = randomUUID();
    const sessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Workflow Replay ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
      pullRequestUrl: "https://github.com/example/repo/pull/11",
      pullRequestNumber: "11",
      prOpenedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Top-level implementation issue",
      description: "Existing PR already received the approved follow-up commit.",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: leaderAgentId,
      checkoutRunId: leaderRunId,
      executionRunId: leaderRunId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 0,
      activeWorkflowSessionId: sessionId,
    });
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: leaderAgentId,
      decidedByUserId: reviewerUserId,
      status: "approved",
      payload: {
        title: "Existing PR update",
        issueIdentifier: createIdentifier(issuePrefix, 1),
        branch: `feature/${createIdentifier(issuePrefix, 1)}`,
        baseBranch: "main",
        pullRequestUrl: "https://github.com/example/repo/pull/11",
        pullRequestNumber: 11,
        commitCreated: true,
        commitSha: "2ba968baee6b1d780b566e7bf2d431ef8f14335f",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: sessionId,
      companyId,
      issueId: parentId,
      issueWorkflowEpoch: 0,
      kind: "push_to_existing_pr",
      status: "consumed",
      fingerprint: [
        parentId,
        "push_to_existing_pr",
        executionWorkspaceId,
        `feature/${createIdentifier(issuePrefix, 1)}`,
        "main",
      ].join(":"),
      approvalId,
      requestRunId: leaderRunId,
      requestedByAgentId: leaderAgentId,
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      pullRequestUrl: "https://github.com/example/repo/pull/11",
      pullRequestNumber: "11",
      commitSha: "2ba968baee6b1d780b566e7bf2d431ef8f14335f",
      gitSideEffectState: "succeeded",
      consumedAt: new Date(),
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({
        status: "in_review",
        assigneeAgentId: null,
        assigneeUserId: reviewerUserId,
        comment: "Re-Handoff For Existing PR Update",
      })
      .expect(409);

    const reloadedIssue = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
      })
      .from(issues)
      .where(eq(issues.id, parentId))
      .then((rows) => rows[0]);

    expect(reloadedIssue).toEqual(
      expect.objectContaining({
        status: "in_progress",
        assigneeAgentId: leaderAgentId,
        assigneeUserId: null,
      }),
    );

    const linkedApprovals = await db
      .select({
        approvalId: issueApprovals.approvalId,
        type: approvals.type,
        status: approvals.status,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toHaveLength(1);
    expect(linkedApprovals[0]).toEqual(
      expect.objectContaining({
        approvalId,
        type: "approve_push_to_existing_pr",
        status: "approved",
      }),
    );
  });

  it("rejects stale agent writes after workflow epoch advanced to board review", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `WS${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Workflow Epoch ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Board review already owns this issue",
      description: "Stale run should not be able to mutate after epoch advance.",
      status: "in_review",
      priority: "medium",
      assigneeUserId: reviewerUserId,
      executionRunId: leaderRunId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 1,
    });

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "in_progress" })
      .expect(409);
  });

  it("creates only one pending pull request approval when the same issue is handed off concurrently", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const executionWorkspaceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: `leader-${leaderAgentId.slice(0, 8)}`,
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: createIdentifier(issuePrefix, 1),
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
    });
    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent implementation issue",
      description: "Implementation completed; requesting review handoff.",
      status: "in_review",
      priority: "medium",
      assigneeUserId: reviewerUserId,
      executionWorkspaceId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    const issuesSvc = issueService(db);
    const approvalsSvc = approvalService(db);
    const issueApprovalsSvc = issueApprovalService(db);
    const projectsSvc = projectService(db);
    const executionWorkspacesSvc = executionWorkspaceService(db);
    const parentIssue = await issuesSvc.getById(parentId);
    expect(parentIssue).toBeTruthy();

    const actor = {
      actorType: "agent",
      actorId: leaderAgentId,
      agentId: leaderAgentId,
      runId: leaderRunId,
      userId: null,
    } as const;
    const payload = {
      title: parentIssue!.title,
      issueIdentifier: parentIssue!.identifier,
      branch: `feature/${createIdentifier(issuePrefix, 1)}`,
      baseBranch: "main",
      summary: "Concurrent parent review handoff",
    };

    await Promise.all([
      findOrCreateLinkedApproval({
        db,
        issue: parentIssue!,
        type: "approve_pull_request",
        agentId: leaderAgentId,
        actor,
        payload,
        source: "test.concurrent_handoff",
      }),
      findOrCreateLinkedApproval({
        db,
        issue: parentIssue!,
        type: "approve_pull_request",
        agentId: leaderAgentId,
        actor,
        payload,
        source: "test.concurrent_handoff",
      }),
    ]);

    const linkedApprovals = await issueApprovalsSvc.listApprovalsForIssue(parentId);
    const pendingPullRequestApprovals = linkedApprovals.filter(
      (approval) => approval.type === "approve_pull_request" && approval.status === "pending",
    );

    expect(pendingPullRequestApprovals).toHaveLength(1);
    expect(pendingPullRequestApprovals[0]?.payload.issueIdentifier).toBe(createIdentifier(issuePrefix, 1));
  });

  it("rejects direct parent completion while approve_pull_request is still pending", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;
    const parentId = randomUUID();
    const approvalId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });

    await db.insert(issues).values({
      id: parentId,
      companyId,
      title: "Parent awaiting PR approval",
      description: "PR approval is still pending.",
      status: "in_review",
      priority: "medium",
      assigneeAgentId: null,
      assigneeUserId: reviewerUserId,
      createdByUserId: reviewerUserId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_pull_request",
      requestedByUserId: reviewerUserId,
      status: "pending",
      payload: {
        issueIdentifier: createIdentifier(issuePrefix, 1),
        branch: "feature/AZAK-020",
        baseBranch: "main",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentId,
      approvalId,
    });

    const response = await request(app)
      .patch(`/api/issues/${parentId}`)
      .set("x-user-id", reviewerUserId)
      .send({ status: "done" })
      .expect(409);

    expect(response.body.error).toContain("Cannot mark issue done while approval is pending");

    const parent = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, parentId))
      .then((rows) => rows[0]);
    expect(parent?.status).toBe("in_review");
  });

  it("allows reviewer to complete child review and automatically hands parent off for board PR approval", async () => {
    const companyId = randomUUID();
    const reviewerUserId = `user-${randomUUID()}`;
    const leaderAgentId = randomUUID();
    const childAgentId = randomUUID();
    const leaderRunId = randomUUID();
    const issuePrefix = `RW${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Review Flow ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: reviewerUserId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(agents).values([
      {
        id: leaderAgentId,
        companyId,
        name: `leader-${leaderAgentId.slice(0, 8)}`,
        role: "general",
        title: "Leader",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: childAgentId,
        companyId,
        name: `dev-${childAgentId.slice(0, 8)}`,
        role: "engineer",
        title: "Developer",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);
    await db.insert(heartbeatRuns).values({
      id: leaderRunId,
      companyId,
      agentId: leaderAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });

    const parentId = randomUUID();
    const childInReviewId = randomUUID();
    const executionWorkspaceId = randomUUID();
    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId,
      ownerIssueId: parentId,
      sourceRepoCwd: "/tmp/source",
      executionCwd: "/tmp/execution",
      ticketKey: "AZAK-REVIEW-1",
      branch: "feature/AZAK-REVIEW-1",
      baseBranch: "main",
      status: "ready",
      provisionedAt: new Date(),
    });
    await db.insert(issues).values([
      {
        id: parentId,
        companyId,
        title: "Parent implementation issue",
        description: "Implementation completed; requesting review handoff.",
        status: "in_progress",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        checkoutRunId: leaderRunId,
        executionRunId: leaderRunId,
        executionWorkspaceId,
        createdByUserId: reviewerUserId,
        issueNumber: 1,
        identifier: createIdentifier(issuePrefix, 1),
        requestDepth: 0,
      },
      {
        id: childInReviewId,
        companyId,
        parentId,
        title: "Child awaiting review",
        status: "in_review",
        priority: "medium",
        assigneeAgentId: leaderAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 2,
        identifier: createIdentifier(issuePrefix, 2),
        requestDepth: 1,
      },
      {
        id: randomUUID(),
        companyId,
        parentId,
        title: "Sibling child done",
        status: "done",
        priority: "medium",
        assigneeAgentId: childAgentId,
        createdByUserId: reviewerUserId,
        issueNumber: 3,
        identifier: createIdentifier(issuePrefix, 3),
        requestDepth: 1,
      },
    ]);

    const leaderToken = createLocalAgentJwt(leaderAgentId, companyId, "codex_local", leaderRunId);
    expect(leaderToken).toBeTruthy();

    const response = await request(app)
      .patch(`/api/issues/${childInReviewId}`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .set("x-baton-run-id", leaderRunId)
      .send({ status: "done" })
      .expect(200);

    expect(response.body.status).toBe("done");

    const updatedParent = await db
      .select({
        status: issues.status,
        assigneeAgentId: issues.assigneeAgentId,
        assigneeUserId: issues.assigneeUserId,
      })
      .from(issues)
      .where(eq(issues.id, parentId))
      .then((rows) => rows[0]);

    expect(updatedParent?.status).toBe("in_review");
    expect(updatedParent?.assigneeAgentId).toBeNull();
    expect(updatedParent?.assigneeUserId).toBe(reviewerUserId);

    const linkedApprovals = await db
      .select({
        type: approvals.type,
        status: approvals.status,
        payload: approvals.payload,
      })
      .from(issueApprovals)
      .innerJoin(approvals, eq(issueApprovals.approvalId, approvals.id))
      .where(eq(issueApprovals.issueId, parentId));

    expect(linkedApprovals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approve_pull_request",
          status: "pending",
          payload: expect.objectContaining({
            branch: "feature/AZAK-REVIEW-1",
            baseBranch: "main",
          }),
        }),
      ]),
    );
  });
  it("returns heartbeat run details from GET /api/heartbeat-runs/:id", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const issuePrefix = `HR${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Heartbeat Detail ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: `agent-${agentId.slice(0, 8)}`,
      role: "engineer",
      title: "Worker",
      status: "running",
      adapterType: "codex_local",
      adapterConfig: { apiKey: "secret-value" },
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "running",
      startedAt: new Date(),
      contextSnapshot: { issueId: "issue-1", apiKey: "top-secret" },
      promptSnapshot: { layers: { promptTemplate: { template: "secret prompt" } } },
    });

    const response = await request(app)
      .get(`/api/heartbeat-runs/${runId}`)
      .expect(200);

    expect(response.body.id).toBe(runId);
    expect(response.body.companyId).toBe(companyId);
    expect(response.body.agentId).toBe(agentId);
    expect(response.body.status).toBe("running");
    expect(response.body.contextSnapshot.issueId).toBe("issue-1");
    expect(JSON.stringify(response.body)).not.toContain("secret-value");
    expect(JSON.stringify(response.body)).not.toContain("top-secret");
  });

  it("normalizes literal newline escapes in issue comments", async () => {
    const companyId = randomUUID();
    const userId = `user-${randomUUID()}`;
    const issueId = randomUUID();
    const issuePrefix = `CM${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Comment Normalize ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "owner",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Comment normalization issue",
      status: "todo",
      priority: "medium",
      createdByUserId: userId,
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
    });

    const rawBody = "## Plan Submitted\\n- first line\\n- second line";

    const createResponse = await request(app)
      .post(`/api/issues/${issueId}/comments`)
      .send({ body: rawBody })
      .expect(201);

    expect(createResponse.body.body).toBe("## Plan Submitted\n- first line\n- second line");
    expect(createResponse.body.body).not.toContain("\\n");

    const listResponse = await request(app)
      .get(`/api/issues/${issueId}/comments`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].body).toBe("## Plan Submitted\n- first line\n- second line");
    expect(listResponse.body[0].body).not.toContain("\\n");
  });

  it("lists workflow sessions for an issue as a timeline ordered newest first", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const issuePrefix = `WS${Date.now().toString().slice(-5)}`;
    const openSessionId = randomUUID();
    const consumedSessionId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: `Workflow Sessions ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Workflow timeline issue",
      status: "in_review",
      priority: "medium",
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 2,
      activeWorkflowSessionId: openSessionId,
    });
    await db.insert(issueWorkflowSessions).values([
      {
        id: consumedSessionId,
        companyId,
        issueId,
        issueWorkflowEpoch: 1,
        kind: "pull_request",
        status: "consumed",
        fingerprint: `${issueId}:pull_request:no-workspace:feature/ws-1:main`,
        branch: "feature/ws-1",
        baseBranch: "main",
        gitSideEffectState: "succeeded",
        commitSha: "abc123",
        createdAt: new Date("2026-03-30T08:00:00.000Z"),
        updatedAt: new Date("2026-03-30T08:05:00.000Z"),
        consumedAt: new Date("2026-03-30T08:05:00.000Z"),
      },
      {
        id: openSessionId,
        companyId,
        issueId,
        issueWorkflowEpoch: 2,
        kind: "push_to_existing_pr",
        status: "open",
        fingerprint: `${issueId}:push_to_existing_pr:no-workspace:feature/ws-1:main`,
        branch: "feature/ws-1",
        baseBranch: "main",
        gitSideEffectState: "pending",
        createdAt: new Date("2026-03-30T09:00:00.000Z"),
        updatedAt: new Date("2026-03-30T09:00:00.000Z"),
      },
    ]);

    const response = await request(app)
      .get(`/api/issues/${issueId}/workflow-sessions`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body.map((session: { id: string }) => session.id)).toEqual([
      openSessionId,
      consumedSessionId,
    ]);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: openSessionId,
        issueId,
        issueWorkflowEpoch: 2,
        kind: "push_to_existing_pr",
        status: "open",
        gitSideEffectState: "pending",
      }),
    );
    expect(response.body[1]).toEqual(
      expect.objectContaining({
        id: consumedSessionId,
        issueId,
        issueWorkflowEpoch: 1,
        kind: "pull_request",
        status: "consumed",
        commitSha: "abc123",
      }),
    );
  });

  it("creates a workflow session for manual approve_completion approvals", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const issuePrefix = `WC${Date.now().toString().slice(-5)}`;

    await db.insert(companies).values({
      id: companyId,
      name: `Workflow Completion ${companyId}`,
      issuePrefix,
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Completion review issue",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "local-board",
      issueNumber: 1,
      identifier: createIdentifier(issuePrefix, 1),
      requestDepth: 0,
      workflowEpoch: 0,
    });

    const approvalResponse = await request(app)
      .post(`/api/companies/${companyId}/approvals`)
      .send({
        type: "approve_completion",
        payload: {
          issueId,
          issueIdentifier: createIdentifier(issuePrefix, 1),
          summary: "manual completion verification",
        },
        issueIds: [issueId],
      })
      .expect(201);

    const approvalId = approvalResponse.body.id as string;
    const sessions = await request(app)
      .get(`/api/issues/${issueId}/workflow-sessions`)
      .expect(200);

    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0]).toEqual(
      expect.objectContaining({
        approvalId,
        issueId,
        kind: "completion",
        status: "open",
        issueWorkflowEpoch: 0,
      }),
    );
  });
});
