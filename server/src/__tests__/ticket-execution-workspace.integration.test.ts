import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  approvals,
  companies,
  executionWorkspaces,
  heartbeatRuns,
  issueApprovals,
  issues,
  projects,
  projectWorkspaces,
} from "@atototo/db";
import { createApp } from "../app.js";
import type { StorageService } from "../storage/types.js";

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PGLITE_ENTRY = path.resolve(
  REPO_ROOT,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/index.js",
);
const MIGRATIONS_FOLDER = path.resolve(REPO_ROOT, "packages/db/src/migrations");

const COMPANY_ID = "d97c9664-315c-4230-84b0-833f8bf6be0a";
const PROJECT_ID = "683a1e86-bffa-4881-8a1b-09934dec6624";
const PROJECT_WORKSPACE_ID = "2030342e-5b94-4e6d-9e81-cc7d3ef830bc";
const LEADER_AGENT_ID = "fd93115d-d1a9-49d9-8f93-41c1c5fefd96";
const FE_AGENT_ID = "21f21fe5-195a-427d-a107-0e944b13251b";
const PARENT_ISSUE_ID = "2b7fb0b9-13dc-46a1-b3c5-da8445ecacfb";

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

async function runGit(cwd: string, args: string[]) {
  return execFile("git", args, { cwd });
}

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

describe("ticket execution workspace approval flow", () => {
  let tempRoot = "";
  let repoDir = "";
  let previousBatonHome: string | undefined;
  let db: any;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-ticket-flow-"));
    repoDir = path.join(tempRoot, "azak");
    await fs.mkdir(repoDir, { recursive: true });

    await runGit(repoDir, ["init", "-b", "main"]);
    await fs.writeFile(path.join(repoDir, "README.md"), "# azak\n", "utf8");
    await runGit(repoDir, ["add", "README.md"]);
    await runGit(repoDir, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    previousBatonHome = process.env.BATON_HOME;
    process.env.BATON_HOME = path.join(tempRoot, ".baton-home");

    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        companies,
        agents,
        approvals,
        projects,
        projectWorkspaces,
        issues,
        issueApprovals,
        executionWorkspaces,
        heartbeatRuns,
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

    await db.insert(companies).values({
      id: COMPANY_ID,
      name: "Craveny",
      issuePrefix: "DOB",
      issueCounter: 35,
      locale: "ko",
    });

    await db.insert(agents).values([
      {
        id: LEADER_AGENT_ID,
        companyId: COMPANY_ID,
        name: "craveny-leader",
        role: "general",
        title: "Craveny Test Leader",
        status: "paused",
        adapterType: "claude_local",
        adapterConfig: {},
      },
      {
        id: FE_AGENT_ID,
        companyId: COMPANY_ID,
        name: "craveny-fe-dev",
        role: "engineer",
        title: "Craveny FE Dev",
        status: "paused",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);

    await db.insert(projects).values({
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      name: "craveny",
      status: "in_progress",
      leadAgentId: LEADER_AGENT_ID,
    });

    await db.insert(projectWorkspaces).values({
      id: PROJECT_WORKSPACE_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      name: "azak",
      cwd: repoDir,
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });

    await db.insert(issues).values({
      id: PARENT_ISSUE_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 be, fe readme.md 작성",
      description: "jira-ticket: AZAK-001",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      createdByUserId: "local-board",
      issueNumber: 35,
      identifier: "DOB-35",
      requestDepth: 0,
    });
  }, 120_000);

  afterAll(async () => {
    if (previousBatonHome === undefined) delete process.env.BATON_HOME;
    else process.env.BATON_HOME = previousBatonHome;
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("blocks the parent, provisions a ticket worktree on approval, and lets child issues inherit it", async () => {
    const approvalCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          summary: "Analyze azak and create backend/frontend README child issues",
        },
        issueIds: [PARENT_ISSUE_ID],
      })
      .expect(201);

    expect(approvalCreate.body.type).toBe("approve_issue_plan");
    expect(approvalCreate.body.payload.workspace).toMatchObject({
      ownerIssueId: PARENT_ISSUE_ID,
      projectId: PROJECT_ID,
      projectWorkspaceId: PROJECT_WORKSPACE_ID,
      projectWorkspaceName: "azak",
      sourceRepoCwd: repoDir,
      ticketKey: "AZAK-001",
      baseBranch: "main",
      branch: "feature/AZAK-001",
    });

    const blockedParent = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, PARENT_ISSUE_ID))
      .then((rows) => rows[0]);
    expect(blockedParent?.status).toBe("blocked");

    const approvalId = approvalCreate.body.id as string;
    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({ decidedByUserId: "local-board" })
      .expect(200);

    const resumedParent = await db
      .select({
        status: issues.status,
        executionWorkspaceId: issues.executionWorkspaceId,
      })
      .from(issues)
      .where(eq(issues.id, PARENT_ISSUE_ID))
      .then((rows) => rows[0]);

    expect(resumedParent?.status).toBe("in_progress");
    expect(typeof resumedParent?.executionWorkspaceId).toBe("string");

    const workspace = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, resumedParent!.executionWorkspaceId!))
      .then((rows) => rows[0]);

    expect(workspace).toBeTruthy();
    expect(workspace?.ticketKey).toBe("AZAK-001");
    expect(workspace?.branch).toBe("feature/AZAK-001");
    expect(workspace?.baseBranch).toBe("main");
    expect(await fs.realpath(workspace!.sourceRepoCwd)).toBe(await fs.realpath(repoDir));
    expect(workspace?.executionCwd).toContain("/AZAK-001/repo");

    const executionStats = await fs.stat(workspace!.executionCwd);
    expect(executionStats.isDirectory()).toBe(true);
    await expect(runGit(repoDir, ["branch", "--show-current"])).resolves.toMatchObject({
      stdout: "main\n",
    });
    await expect(runGit(workspace!.executionCwd, ["branch", "--show-current"])).resolves.toMatchObject({
      stdout: "feature/AZAK-001\n",
    });

    const childCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({
        projectId: PROJECT_ID,
        parentId: PARENT_ISSUE_ID,
        title: "Frontend README.md 작성 - /frontend/ 디렉토리 분석",
        description: "frontend README 작성",
        status: "todo",
        priority: "medium",
        assigneeAgentId: FE_AGENT_ID,
      })
      .expect(201);

    expect(childCreate.body.identifier).toBe("DOB-36");
    expect(childCreate.body.parentId).toBe(PARENT_ISSUE_ID);
    expect(childCreate.body.executionWorkspaceId).toBe(resumedParent?.executionWorkspaceId);
    expect(childCreate.body.billingCode).toBe("AZAK-001");
  }, 120_000);

  it("dedupes plan approvals created from payload.issueId and links the existing approval", async () => {
    const dedupeIssueId = "9b6b1ebb-7920-4634-afc0-19fb38f81427";
    await db.insert(issues).values({
      id: dedupeIssueId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성 (dedupe)",
      description: "jira-ticket: AZAK-002",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      createdByUserId: "local-board",
      issueNumber: 40,
      identifier: "DOB-40",
      requestDepth: 0,
    });

    const firstCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          issueId: dedupeIssueId,
          issueIdentifier: "DOB-40",
          summary: "Analyze azak and create child issues",
        },
      })
      .expect(201);

    expect(firstCreate.body.payload.workspace).toMatchObject({
      ownerIssueId: dedupeIssueId,
      ticketKey: "AZAK-002",
      branch: "feature/AZAK-002",
    });

    const linkedIssueRows = await db
      .select()
      .from(issueApprovals)
      .where(eq(issueApprovals.issueId, dedupeIssueId));
    expect(linkedIssueRows).toHaveLength(1);

    const secondCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          issueId: dedupeIssueId,
          issueIdentifier: "DOB-40",
          summary: "Analyze azak and create child issues",
        },
      })
      .expect(200);

    expect(secondCreate.body.id).toBe(firstCreate.body.id);

    const pendingApprovalsForIssue = await db
      .select()
      .from(approvals)
      .where(eq(approvals.companyId, COMPANY_ID))
      .then((rows) =>
        rows.filter((row) => {
          const payloadIssueId = typeof row.payload.issueId === "string" ? row.payload.issueId : null;
          return row.type === "approve_issue_plan" && row.status === "pending" && payloadIssueId === dedupeIssueId;
        }),
    );
    expect(pendingApprovalsForIssue).toHaveLength(1);
  });

  it("treats payload.issueIds as linked issues for workspace enrichment, linking, and blocking", async () => {
    const payloadIssueIdsIssueId = "a4c0f9c1-a151-4a72-9b90-820b4ea749c5";
    await db.insert(issues).values({
      id: payloadIssueIdsIssueId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성 (payload.issueIds)",
      description: "jira-ticket: AZAK-003",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      createdByUserId: "local-board",
      issueNumber: 41,
      identifier: "DOB-41",
      requestDepth: 0,
    });

    const approvalCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          issueIds: [payloadIssueIdsIssueId],
          summary: "Analyze azak and create child issues",
        },
      })
      .expect(201);

    expect(approvalCreate.body.payload.issueId).toBe(payloadIssueIdsIssueId);
    expect(approvalCreate.body.payload.workspace).toMatchObject({
      ownerIssueId: payloadIssueIdsIssueId,
      ticketKey: "AZAK-003",
      branch: "feature/AZAK-003",
    });

    const linkedIssueRows = await db
      .select()
      .from(issueApprovals)
      .where(eq(issueApprovals.issueId, payloadIssueIdsIssueId));
    expect(linkedIssueRows).toHaveLength(1);

    const blockedIssue = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, payloadIssueIdsIssueId))
      .then((rows) => rows[0]);
    expect(blockedIssue?.status).toBe("blocked");

    const secondCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          issueIds: [payloadIssueIdsIssueId],
          summary: "Analyze azak and create child issues",
        },
      })
      .expect(200);

    expect(secondCreate.body.id).toBe(approvalCreate.body.id);
  });

  it("falls back to the current run context issueId when approval payload has no issue linkage", async () => {
    const runIssueId = "db71783e-23f4-45fe-8764-4823c20637d2";
    const runId = "fb1ec0ac-eaa9-4606-ae84-7db871aa0db2";
    await db.insert(issues).values({
      id: runIssueId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성 (run context fallback)",
      description: "jira-ticket: AZAK-004",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      createdByUserId: "local-board",
      issueNumber: 42,
      identifier: "DOB-42",
      requestDepth: 0,
    });
    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId: COMPANY_ID,
      agentId: LEADER_AGENT_ID,
      invocationSource: "assignment",
      status: "running",
      startedAt: new Date(),
      contextSnapshot: {
        issueId: runIssueId,
        taskId: runIssueId,
        wakeReason: "issue_assigned",
      },
    });

    const approvalCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/approvals`)
      .set("x-baton-run-id", runId)
      .send({
        type: "approve_issue_plan",
        requestedByAgentId: LEADER_AGENT_ID,
        payload: {
          plan: "fallback from current run context",
        },
      })
      .expect(201);

    expect(approvalCreate.body.payload.issueId).toBe(runIssueId);
    expect(approvalCreate.body.payload.issueIdentifier).toBe("DOB-42");
    expect(approvalCreate.body.payload.workspace).toMatchObject({
      ownerIssueId: runIssueId,
      ticketKey: "AZAK-004",
      branch: "feature/AZAK-004",
    });

    const linkedIssueRows = await db
      .select()
      .from(issueApprovals)
      .where(eq(issueApprovals.issueId, runIssueId));
    expect(linkedIssueRows).toHaveLength(1);

    const blockedIssue = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.id, runIssueId))
      .then((rows) => rows[0]);
    expect(blockedIssue?.status).toBe("blocked");
  });

  it("reuses an existing active child issue when an agent retries the same delegated child key", async () => {
    const parentId = "4edca6a1-a34c-4f10-b767-2b3575446519";
    const approvalId = "2c8a8c21-a48b-45da-938a-8fe3516f9cbe";
    const executionWorkspaceId = "1fe0b294-1352-4d2b-9f9a-e20df4db0f3a";

    await db.insert(executionWorkspaces).values({
      id: executionWorkspaceId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      projectWorkspaceId: PROJECT_WORKSPACE_ID,
      ownerIssueId: parentId,
      ticketKey: "AZAK-005",
      sourceRepoCwd: repoDir,
      executionCwd: path.join(tempRoot, "worktrees", "AZAK-005", "repo"),
      branch: "feature/AZAK-005",
      baseBranch: "main",
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
      provisionedAt: new Date(),
      cleanedAt: null,
    });

    await db.insert(issues).values({
      id: parentId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성 (duplicate guard)",
      description: "jira-ticket: AZAK-005",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      executionWorkspaceId,
      createdByUserId: "local-board",
      issueNumber: 43,
      identifier: "DOB-43",
      requestDepth: 0,
    });

    await db.insert(approvals).values({
      id: approvalId,
      companyId: COMPANY_ID,
      type: "approve_issue_plan",
      requestedByAgentId: LEADER_AGENT_ID,
      requestedByUserId: null,
      status: "approved",
      payload: {
        issueId: parentId,
        issueIdentifier: "DOB-43",
        workspace: {
          ownerIssueId: parentId,
          projectId: PROJECT_ID,
          projectWorkspaceId: PROJECT_WORKSPACE_ID,
          projectWorkspaceName: "azak",
          sourceRepoCwd: repoDir,
          ticketKey: "AZAK-005",
          baseBranch: "main",
          branch: "feature/AZAK-005",
        },
      },
      decisionNote: null,
      decidedByUserId: "local-board",
      decidedAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(issueApprovals).values({
      companyId: COMPANY_ID,
      issueId: parentId,
      approvalId,
      linkedByAgentId: LEADER_AGENT_ID,
      linkedByUserId: null,
    });
    const firstCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({
        projectId: PROJECT_ID,
        parentId,
        title: "Backend README.md 작성 (backend/README.md)",
        description: "backend README 작성",
        status: "todo",
        priority: "medium",
        assigneeAgentId: FE_AGENT_ID,
        delegation: {
          kind: "file_write",
          key: "backend-readme",
          targetPath: "backend/README.md",
        },
      })
      .expect(201);

    const secondCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({
        projectId: PROJECT_ID,
        parentId,
        title: "[AZAK-005] backend/README.md 작성",
        description: "backend README 작성 retry",
        status: "todo",
        priority: "medium",
        assigneeAgentId: FE_AGENT_ID,
        delegation: {
          kind: "file_write",
          key: "backend-readme",
          targetPath: "backend/README.md",
        },
      })
      .expect(200);

    expect(secondCreate.body.id).toBe(firstCreate.body.id);

    const children = await db
      .select({ id: issues.id })
      .from(issues)
      .where(eq(issues.parentId, parentId));
    expect(children).toHaveLength(1);
  });

  it("allows a new child issue when the previous delegated child key is already terminal", async () => {
    const parentId = "1875f56c-272c-4a34-b7f8-db04e4826f65";

    await db.insert(issues).values({
      id: parentId,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성 (terminal retry)",
      description: "jira-ticket: AZAK-006",
      status: "in_progress",
      priority: "medium",
      assigneeAgentId: LEADER_AGENT_ID,
      createdByUserId: "local-board",
      issueNumber: 44,
      identifier: "DOB-44",
      requestDepth: 0,
    });

    const firstCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({
        projectId: PROJECT_ID,
        parentId,
        title: "Backend README.md 작성",
        description: "backend README 작성",
        status: "done",
        priority: "medium",
        assigneeAgentId: FE_AGENT_ID,
        delegation: {
          kind: "file_write",
          key: "backend-readme",
          targetPath: "backend/README.md",
        },
      })
      .expect(201);

    const secondCreate = await request(app)
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({
        projectId: PROJECT_ID,
        parentId,
        title: "[AZAK-006] backend/README.md 작성",
        description: "backend README 다시 작성",
        status: "todo",
        priority: "medium",
        assigneeAgentId: FE_AGENT_ID,
        delegation: {
          kind: "file_write",
          key: "backend-readme",
          targetPath: "backend/README.md",
        },
      })
      .expect(201);

    expect(secondCreate.body.id).not.toBe(firstCreate.body.id);

    const children = await db
      .select({ id: issues.id, status: issues.status })
      .from(issues)
      .where(eq(issues.parentId, parentId));
    expect(children).toHaveLength(2);
    expect(children.map((row) => row.status).sort()).toEqual(["done", "todo"]);
  });
});
