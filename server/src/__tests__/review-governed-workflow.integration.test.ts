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
  issues,
} from "@atototo/db";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { createApp } from "../app.js";
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
});
