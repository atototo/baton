import { execFile as execFileCb } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  agentWakeupRequests,
  approvals,
  companies,
  executionWorkspaces,
  heartbeatRuns,
  issueApprovals,
  issueComments,
  issueWorkflowSessions,
  issues,
  projects,
  projectWorkspaces,
} from "@atototo/db";
import { createApp } from "../app.js";
import { executionWorkspaceService, heartbeatService } from "../services/index.js";
import type { StorageService } from "../storage/types.js";

const execFile = promisify(execFileCb);
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

async function runGit(cwd: string, args: string[]) {
  return execFile("git", args, { cwd });
}

async function cloneRepo(originDir: string, targetDir: string) {
  await runGit(path.dirname(targetDir), ["clone", originDir, targetDir]);
  await runGit(targetDir, ["config", "user.name", "atototo"]);
  await runGit(targetDir, ["config", "user.email", "atoto0311@gmail.com"]);
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

describe("pull request approval live side effects", () => {
  let tempRoot = "";
  let repoDir = "";
  let bareDir = "";
  let fakeBinDir = "";
  let previousPath: string | undefined;
  let previousBatonHome: string | undefined;
  let previousGhState: string | undefined;
  let previousGhLog: string | undefined;
  let db: any;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-pr-approval-"));
    repoDir = path.join(tempRoot, "azak");
    bareDir = path.join(tempRoot, "azak-origin.git");
    fakeBinDir = path.join(tempRoot, "bin");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.mkdir(fakeBinDir, { recursive: true });

    await fs.mkdir(bareDir, { recursive: true });
    await runGit(bareDir, ["init", "--bare"]);
    await runGit(repoDir, ["init", "-b", "main"]);
    await fs.writeFile(path.join(repoDir, "README.md"), "# azak\n", "utf8");
    await runGit(repoDir, ["add", "README.md"]);
    await runGit(repoDir, ["-c", "user.name=atototo", "-c", "user.email=atoto0311@gmail.com", "commit", "-m", "init"]);
    await runGit(repoDir, ["remote", "add", "origin", bareDir]);
    await runGit(repoDir, ["push", "-u", "origin", "main"]);

    const ghStateFile = path.join(tempRoot, "gh-state");
    const ghLogFile = path.join(tempRoot, "gh-log");
    await fs.writeFile(
      path.join(fakeBinDir, "gh"),
      `#!/bin/sh
set -eu
LOG_FILE="${ghLogFile}"
STATE_FILE="${ghStateFile}"
printf '%s\\n' "$*" >> "$LOG_FILE"
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  if [ -f "$STATE_FILE" ]; then
    printf '[{"url":"https://github.com/atototo/azak/pull/123","number":123}]'
  else
    printf '[]'
  fi
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  touch "$STATE_FILE"
  printf '%s\\n' 'https://github.com/atototo/azak/pull/123'
  exit 0
fi
echo "unsupported gh command: $*" >&2
exit 1
`,
      { mode: 0o755 },
    );

    previousPath = process.env.PATH;
    previousGhState = process.env.BATON_TEST_GH_STATE;
    previousGhLog = process.env.BATON_TEST_GH_LOG;
    process.env.PATH = `${fakeBinDir}:${previousPath ?? ""}`;
    process.env.BATON_TEST_GH_STATE = ghStateFile;
    process.env.BATON_TEST_GH_LOG = ghLogFile;

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
        issueComments,
        issueWorkflowSessions,
        executionWorkspaces,
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
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousGhState === undefined) delete process.env.BATON_TEST_GH_STATE;
    else process.env.BATON_TEST_GH_STATE = previousGhState;
    if (previousGhLog === undefined) delete process.env.BATON_TEST_GH_LOG;
    else process.env.BATON_TEST_GH_LOG = previousGhLog;
    if (previousBatonHome === undefined) delete process.env.BATON_HOME;
    else process.env.BATON_HOME = previousBatonHome;
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("creates a real PR side effect on approve_pull_request and closes the parent issue", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const projectWorkspaceId = randomUUID();
    const leaderAgentId = randomUUID();
    const parentIssueId = randomUUID();
    const ticketKey = "AZAK-PR-1";

    await db.insert(companies).values({
      id: companyId,
      name: "Craveny",
      issuePrefix: "D44",
      issueCounter: 43,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "craveny-leader",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "claude_local",
      adapterConfig: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "craveny",
      status: "in_progress",
      leadAgentId: leaderAgentId,
    });
    await db.insert(projectWorkspaces).values({
      id: projectWorkspaceId,
      companyId,
      projectId,
      name: "azak",
      cwd: repoDir,
      repoUrl: "https://github.com/atototo/azak",
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });
    await db.insert(issues).values({
      id: parentIssueId,
      companyId,
      projectId,
      title: "azak 프로젝트 분석 후 backend/frontend README.md 작성",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "local-board",
      createdByUserId: "local-board",
      issueNumber: 43,
      identifier: "DOB-43",
      requestDepth: 0,
    });

    const executionWorkspacesSvc = executionWorkspaceService(db);
    const workspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
      companyId,
      plan: {
        ownerIssueId: parentIssueId,
        projectId,
        projectWorkspaceId,
        projectWorkspaceName: "azak",
        sourceRepoCwd: repoDir,
        ticketKey,
        baseBranch: "main",
        branch: `feature/${ticketKey}`,
      },
    });
    expect(workspace).toBeTruthy();

    await runGit(repoDir, ["config", "user.name", "atototo"]);
    await runGit(repoDir, ["config", "user.email", "atoto0311@gmail.com"]);
    await runGit(workspace.executionCwd, ["config", "user.name", "atototo"]);
    await runGit(workspace.executionCwd, ["config", "user.email", "atoto0311@gmail.com"]);

    await fs.mkdir(path.join(workspace.executionCwd, "backend"), { recursive: true });
    await fs.mkdir(path.join(workspace.executionCwd, "frontend"), { recursive: true });
    await fs.writeFile(path.join(workspace.executionCwd, "backend/README.md"), "# backend\n", "utf8");
    await fs.writeFile(path.join(workspace.executionCwd, "frontend/README.md"), "# frontend\n", "utf8");

    await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, parentIssueId));

    const approvalId = randomUUID();
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_pull_request",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        title: "azak 프로젝트 분석 후 backend/frontend README.md 작성",
        issueIdentifier: "DOB-43",
        branch: `feature/${ticketKey}`,
        baseBranch: "main",
        summary: "README 정리 완료. PR을 생성합니다.",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentIssueId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: randomUUID(),
      companyId,
      issueId: parentIssueId,
      issueWorkflowEpoch: 0,
      kind: "pull_request",
      status: "open",
      fingerprint: [parentIssueId, "pull_request", workspace.id, `feature/${ticketKey}`, "main"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
      branch: `feature/${ticketKey}`,
      baseBranch: "main",
    });

    const response = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({ decidedByUserId: "local-board" })
      .expect(200);

    expect(response.body.status).toBe("approved");
    expect(response.body.payload.repository).toBe("atototo/azak");
    expect(response.body.payload.pullRequestUrl).toBe("https://github.com/atototo/azak/pull/123");
    expect(response.body.payload.baseBranch).toBe("main");
    expect(response.body.payload.branch).toBe(`feature/${ticketKey}`);
    expect(typeof response.body.payload.commitSha).toBe("string");

    const updatedParent = await db
      .select({
        status: issues.status,
        executionWorkspaceId: issues.executionWorkspaceId,
      })
      .from(issues)
      .where(eq(issues.id, parentIssueId))
      .then((rows) => rows[0]);

    expect(updatedParent?.status).toBe("done");
    expect(updatedParent?.executionWorkspaceId).toBe(workspace.id);

    const parentComments = await db
      .select({ body: issueComments.body })
      .from(issueComments)
      .where(eq(issueComments.issueId, parentIssueId));
    expect(parentComments.some((comment) => comment.body.includes("https://github.com/atototo/azak/pull/123"))).toBe(
      true,
    );

    const { stdout: remoteHead } = await runGit(bareDir, ["rev-parse", `refs/heads/feature/${ticketKey}`]);
    expect(remoteHead.trim().length).toBeGreaterThan(0);

    const { stdout: ghLog } = await execFile("cat", [path.join(tempRoot, "gh-log")]);
    expect(ghLog).toContain("pr create");
    expect(ghLog).toContain(`--base main`);
    expect(ghLog).toContain(`--head feature/${ticketKey}`);
    expect(ghLog).toContain("add backend and frontend README documentation");
    expect(ghLog).toContain("## Summary");
    expect(ghLog).toContain("## Changes");
    expect(ghLog).toContain("backend/README.md");
    expect(ghLog).toContain("frontend/README.md");
    expect(ghLog).toContain("DOB-43");

    const workflowSession = await db
      .select({
        approvalId: issueWorkflowSessions.approvalId,
        status: issueWorkflowSessions.status,
        gitSideEffectState: issueWorkflowSessions.gitSideEffectState,
        commitSha: issueWorkflowSessions.commitSha,
        pullRequestUrl: issueWorkflowSessions.pullRequestUrl,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.approvalId, approvalId))
      .then((rows) => rows[0]);

    expect(workflowSession).toEqual(
      expect.objectContaining({
        approvalId,
        status: "consumed",
        gitSideEffectState: "succeeded",
        commitSha: response.body.payload.commitSha,
        pullRequestUrl: "https://github.com/atototo/azak/pull/123",
      }),
    );
  }, 120_000);

  it("syncs the execution branch before creating pull request approval", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const projectWorkspaceId = randomUUID();
    const leaderAgentId = randomUUID();
    const parentIssueId = randomUUID();
    const ticketKey = "AZAK-PR-2";

    await db.insert(companies).values({
      id: companyId,
      name: "Craveny",
      issuePrefix: "D45",
      issueCounter: 44,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "craveny-leader-2",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "claude_local",
      adapterConfig: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "craveny-2",
      status: "in_progress",
      leadAgentId: leaderAgentId,
    });
    await db.insert(projectWorkspaces).values({
      id: projectWorkspaceId,
      companyId,
      projectId,
      name: "azak",
      cwd: repoDir,
      repoUrl: "https://github.com/atototo/azak",
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });
    await runGit(repoDir, ["checkout", "main"]);
    await runGit(repoDir, ["pull", "--ff-only", "origin", "main"]);
    await db.insert(issues).values({
      id: parentIssueId,
      companyId,
      projectId,
      title: "기존 브랜치를 최신 main으로 동기화 후 PR 준비",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "local-board",
      createdByUserId: "local-board",
      issueNumber: 44,
      identifier: "DOB-44",
      requestDepth: 0,
    });

    const executionWorkspacesSvc = executionWorkspaceService(db);
    const workspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
      companyId,
      plan: {
        ownerIssueId: parentIssueId,
        projectId,
        projectWorkspaceId,
        projectWorkspaceName: "azak",
        sourceRepoCwd: repoDir,
        ticketKey,
        baseBranch: "main",
        branch: `feature/${ticketKey}`,
      },
    });

    await runGit(workspace.executionCwd, ["config", "user.name", "atototo"]);
    await runGit(workspace.executionCwd, ["config", "user.email", "atoto0311@gmail.com"]);
    await fs.writeFile(path.join(workspace.executionCwd, "feature-sync.txt"), "feature sync\n", "utf8");
    await runGit(workspace.executionCwd, ["add", "feature-sync.txt"]);
    await runGit(workspace.executionCwd, ["commit", "-m", "feature sync work"]);

    const updaterDir = path.join(tempRoot, `updater-${ticketKey}`);
    await cloneRepo(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "base-sync.txt"), "base sync\n", "utf8");
    await runGit(updaterDir, ["add", "base-sync.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base sync"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, parentIssueId));

    const response = await request(app)
      .post(`/api/companies/${companyId}/approvals`)
      .send({
        type: "approve_pull_request",
        requestedByAgentId: leaderAgentId,
        payload: {
          summary: "브랜치 최신화 후 PR 준비",
          branch: `feature/${ticketKey}`,
          baseBranch: "main",
        },
        issueIds: [parentIssueId],
      })
      .expect(201);

    expect(response.body.payload.syncStatus).toBe("verified");
    expect(typeof response.body.payload.lastBaseCommitSha).toBe("string");

    const storedWorkspace = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, workspace.id))
      .then((rows) => rows[0]);
    expect(storedWorkspace?.syncStatus).toBe("verified");
    expect(storedWorkspace?.lastBaseCommitSha).toBeTruthy();

    const { stdout } = await runGit(workspace.executionCwd, ["show", "--stat", "--oneline", "HEAD"]);
    expect(stdout).toContain("base-sync.txt");
  }, 120_000);

  it("approves push to an existing PR without opening a new pull request", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const projectWorkspaceId = randomUUID();
    const leaderAgentId = randomUUID();
    const parentIssueId = randomUUID();
    const ticketKey = "AZAK-PR-EXISTING-1";

    await db.insert(companies).values({
      id: companyId,
      name: "Craveny",
      issuePrefix: "D46",
      issueCounter: 45,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "craveny-leader-existing-pr",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "claude_local",
      adapterConfig: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "craveny-existing-pr",
      status: "in_progress",
      leadAgentId: leaderAgentId,
    });
    await db.insert(projectWorkspaces).values({
      id: projectWorkspaceId,
      companyId,
      projectId,
      name: "azak",
      cwd: repoDir,
      repoUrl: "https://github.com/atototo/azak",
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });
    await db.insert(issues).values({
      id: parentIssueId,
      companyId,
      projectId,
      title: "기존 PR 업데이트 승인 테스트",
      status: "in_review",
      priority: "medium",
      assigneeUserId: "local-board",
      createdByUserId: "local-board",
      issueNumber: 45,
      identifier: "DOB-45",
      requestDepth: 0,
    });

    const executionWorkspacesSvc = executionWorkspaceService(db);
    const workspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
      companyId,
      plan: {
        ownerIssueId: parentIssueId,
        projectId,
        projectWorkspaceId,
        projectWorkspaceName: "azak",
        sourceRepoCwd: repoDir,
        ticketKey,
        baseBranch: "main",
        branch: `feature/${ticketKey}`,
      },
    });

    await db.update(executionWorkspaces)
      .set({
        pullRequestUrl: "https://github.com/atototo/azak/pull/123",
        pullRequestNumber: "123",
        prOpenedAt: new Date(),
      })
      .where(eq(executionWorkspaces.id, workspace.id));
    await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, parentIssueId));
    await runGit(workspace.executionCwd, ["config", "user.name", "atototo"]);
    await runGit(workspace.executionCwd, ["config", "user.email", "atoto0311@gmail.com"]);
    await fs.writeFile(path.join(workspace.executionCwd, "follow-up.txt"), "follow-up change\n", "utf8");
    await fs.writeFile(path.join(tempRoot, "gh-log"), "", "utf8");

    const approvalId = randomUUID();
    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "approve_push_to_existing_pr",
      requestedByAgentId: leaderAgentId,
      status: "pending",
      payload: {
        title: "기존 PR 업데이트 승인 테스트",
        issueIdentifier: "DOB-45",
        branch: `feature/${ticketKey}`,
        baseBranch: "main",
        summary: "기존 PR #123에 추가 커밋을 반영합니다.",
      },
    });
    await db.insert(issueApprovals).values({
      companyId,
      issueId: parentIssueId,
      approvalId,
    });
    await db.insert(issueWorkflowSessions).values({
      id: randomUUID(),
      companyId,
      issueId: parentIssueId,
      issueWorkflowEpoch: 0,
      kind: "push_to_existing_pr",
      status: "open",
      fingerprint: [parentIssueId, "push_to_existing_pr", workspace.id, `feature/${ticketKey}`, "main"].join(":"),
      approvalId,
      requestedByAgentId: leaderAgentId,
      branch: `feature/${ticketKey}`,
      baseBranch: "main",
    });
    const seededWorkflowSession = await db
      .select({
        approvalId: issueWorkflowSessions.approvalId,
        status: issueWorkflowSessions.status,
      })
      .from(issueWorkflowSessions)
      .where(eq(issueWorkflowSessions.approvalId, approvalId))
      .then((rows) => rows[0]);
    expect(seededWorkflowSession).toEqual(
      expect.objectContaining({
        approvalId,
        status: "open",
      }),
    );

    const response = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({ decidedByUserId: "local-board" })
      .expect(200);

    expect(response.body.status).toBe("approved");
    expect(response.body.payload.pullRequestUrl).toBe("https://github.com/atototo/azak/pull/123");
    expect(response.body.payload.commitCreated).toBe(true);
    expect(typeof response.body.payload.commitSha).toBe("string");

    const updatedParent = await db
      .select({
        status: issues.status,
      })
      .from(issues)
      .where(eq(issues.id, parentIssueId))
      .then((rows) => rows[0]);

    expect(updatedParent?.status).toBe("done");

    const parentComments = await db
      .select({ body: issueComments.body })
      .from(issueComments)
      .where(eq(issueComments.issueId, parentIssueId));
    expect(parentComments.some((comment) => comment.body.includes("기존 PR"))).toBe(true);
    expect(parentComments.some((comment) => comment.body.includes("커밋"))).toBe(true);

    const { stdout: ghLog } = await execFile("cat", [path.join(tempRoot, "gh-log")]);
    expect(ghLog).not.toContain("pr create");

    const { stdout: remoteHead } = await runGit(bareDir, ["rev-parse", `refs/heads/feature/${ticketKey}`]);
    expect(remoteHead.trim()).toBe(response.body.payload.commitSha);

  }, 120_000);

  it("blocks pull request approval creation when pre-pr sync conflicts", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const projectWorkspaceId = randomUUID();
    const leaderAgentId = randomUUID();
    const assigneeAgentId = randomUUID();
    const parentIssueId = randomUUID();
    const ticketKey = "AZAK-PR-3";
    const issuePrefix = `D${companyId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Craveny",
      issuePrefix,
      issueCounter: 45,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "craveny-leader-3",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "claude_local",
      adapterConfig: {},
    });
    await db.insert(agents).values({
      id: assigneeAgentId,
      companyId,
      name: "craveny-dev-3",
      role: "engineer",
      title: "Developer",
      status: "idle",
      adapterType: "process",
      adapterConfig: { command: "sh", args: ["-lc", "true"], cwd: repoDir },
    });
    await db.insert(heartbeatRuns).values({
      id: randomUUID(),
      companyId,
      agentId: assigneeAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "craveny-3",
      status: "in_progress",
      leadAgentId: leaderAgentId,
    });
    await db.insert(projectWorkspaces).values({
      id: projectWorkspaceId,
      companyId,
      projectId,
      name: "azak",
      cwd: repoDir,
      repoUrl: "https://github.com/atototo/azak",
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });
    await runGit(repoDir, ["checkout", "main"]);
    await runGit(repoDir, ["pull", "--ff-only", "origin", "main"]);
    await db.insert(issues).values({
      id: parentIssueId,
      companyId,
      projectId,
      title: "충돌 발생 시 PR approval 생성 차단",
      status: "in_review",
      priority: "medium",
      assigneeAgentId,
      createdByUserId: "local-board",
      issueNumber: 45,
      identifier: `${issuePrefix}-45`,
      requestDepth: 0,
    });

    await fs.writeFile(path.join(repoDir, "shared-pr-sync.txt"), "base original\n", "utf8");
    await runGit(repoDir, ["add", "shared-pr-sync.txt"]);
    await runGit(repoDir, ["commit", "-m", "shared sync base"]);
    await runGit(repoDir, ["push", "origin", "main"]);

    const executionWorkspacesSvc = executionWorkspaceService(db);
    const workspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
      companyId,
      plan: {
        ownerIssueId: parentIssueId,
        projectId,
        projectWorkspaceId,
        projectWorkspaceName: "azak",
        sourceRepoCwd: repoDir,
        ticketKey,
        baseBranch: "main",
        branch: `feature/${ticketKey}`,
      },
    });

    await runGit(workspace.executionCwd, ["config", "user.name", "atototo"]);
    await runGit(workspace.executionCwd, ["config", "user.email", "atoto0311@gmail.com"]);
    await fs.writeFile(path.join(workspace.executionCwd, "shared-pr-sync.txt"), "feature version\n", "utf8");
    await runGit(workspace.executionCwd, ["add", "shared-pr-sync.txt"]);
    await runGit(workspace.executionCwd, ["commit", "-m", "feature conflicting change"]);

    const updaterDir = path.join(tempRoot, `conflict-updater-${ticketKey}`);
    await cloneRepo(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "shared-pr-sync.txt"), "base version\n", "utf8");
    await runGit(updaterDir, ["add", "shared-pr-sync.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base conflicting change"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, parentIssueId));

    const response = await request(app)
      .post(`/api/companies/${companyId}/approvals`)
      .send({
        type: "approve_pull_request",
        requestedByAgentId: leaderAgentId,
        payload: {
          summary: "충돌 확인",
          branch: `feature/${ticketKey}`,
          baseBranch: "main",
        },
        issueIds: [parentIssueId],
      })
      .expect(409);

    expect(response.body.error).toContain("conflict");

    const storedWorkspace = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, workspace.id))
      .then((rows) => rows[0]);
    expect(storedWorkspace?.syncStatus).toBe("conflicted");
    expect(storedWorkspace?.conflictSummary).toMatchObject({
      branch: `feature/${ticketKey}`,
      baseBranch: "main",
    });
    const recoveryWakeups = await db
      .select()
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.agentId, assigneeAgentId));
    const recoveryWakeup = recoveryWakeups.find((request) => request.reason === "execution_workspace_conflict_recovery");
    expect(recoveryWakeup).toBeTruthy();
    expect(recoveryWakeup?.payload).toMatchObject({
      issueId: parentIssueId,
      executionWorkspaceId: workspace.id,
    });
  }, 120_000);

  it("marks an open pull request workspace as drifted when post-pr resync fails", async () => {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const projectWorkspaceId = randomUUID();
    const leaderAgentId = randomUUID();
    const assigneeAgentId = randomUUID();
    const parentIssueId = randomUUID();
    const ticketKey = "AZAK-PR-4";
    const issuePrefix = `D${companyId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Craveny",
      issuePrefix,
      issueCounter: 46,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: leaderAgentId,
      companyId,
      name: "craveny-leader-4",
      role: "general",
      title: "Leader",
      status: "paused",
      adapterType: "claude_local",
      adapterConfig: {},
    });
    await db.insert(agents).values({
      id: assigneeAgentId,
      companyId,
      name: "craveny-dev-4",
      role: "engineer",
      title: "Developer",
      status: "idle",
      adapterType: "process",
      adapterConfig: { command: "sh", args: ["-lc", "true"], cwd: repoDir },
    });
    await db.insert(heartbeatRuns).values({
      id: randomUUID(),
      companyId,
      agentId: assigneeAgentId,
      invocationSource: "manual",
      status: "running",
      startedAt: new Date(),
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "craveny-4",
      status: "in_progress",
      leadAgentId: leaderAgentId,
    });
    await db.insert(projectWorkspaces).values({
      id: projectWorkspaceId,
      companyId,
      projectId,
      name: "azak",
      cwd: repoDir,
      repoUrl: "https://github.com/atototo/azak",
      isPrimary: true,
      metadata: { defaultBaseBranch: "main" },
    });
    await runGit(repoDir, ["checkout", "main"]);
    await runGit(repoDir, ["pull", "--ff-only", "origin", "main"]);
    await db.insert(issues).values({
      id: parentIssueId,
      companyId,
      projectId,
      title: "post-pr drift detection",
      status: "in_review",
      priority: "medium",
      assigneeAgentId,
      createdByUserId: "local-board",
      issueNumber: 46,
      identifier: `${issuePrefix}-46`,
      requestDepth: 0,
    });

    const executionWorkspacesSvc = executionWorkspaceService(db);
    const workspace = await executionWorkspacesSvc.provisionExecutionWorkspace({
      companyId,
      plan: {
        ownerIssueId: parentIssueId,
        projectId,
        projectWorkspaceId,
        projectWorkspaceName: "azak",
        sourceRepoCwd: repoDir,
        ticketKey,
        baseBranch: "main",
        branch: `feature/${ticketKey}`,
      },
    });
    await runGit(workspace.executionCwd, ["config", "user.name", "atototo"]);
    await runGit(workspace.executionCwd, ["config", "user.email", "atoto0311@gmail.com"]);

    await fs.writeFile(path.join(workspace.executionCwd, "shared-post-pr.txt"), "feature version\n", "utf8");
    await runGit(workspace.executionCwd, ["add", "shared-post-pr.txt"]);
    await runGit(workspace.executionCwd, ["commit", "-m", "feature post-pr change"]);

    await db.update(issues).set({ executionWorkspaceId: workspace.id }).where(eq(issues.id, parentIssueId));

    const approvalCreate = await request(app)
      .post(`/api/companies/${companyId}/approvals`)
      .send({
        type: "approve_pull_request",
        requestedByAgentId: leaderAgentId,
        payload: {
          summary: "drift test",
          branch: `feature/${ticketKey}`,
          baseBranch: "main",
        },
        issueIds: [parentIssueId],
      })
      .expect(201);

    const approvalId = approvalCreate.body.id as string;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .send({ decidedByUserId: "local-board" })
      .expect(200);

    const updaterDir = path.join(tempRoot, `post-pr-drift-${ticketKey}`);
    await cloneRepo(bareDir, updaterDir);
    await runGit(updaterDir, ["checkout", "main"]);
    await fs.writeFile(path.join(updaterDir, "shared-post-pr.txt"), "base version\n", "utf8");
    await runGit(updaterDir, ["add", "shared-post-pr.txt"]);
    await runGit(updaterDir, ["commit", "-m", "base post-pr change"]);
    await runGit(updaterDir, ["push", "origin", "main"]);

    const heartbeat = heartbeatService(db);
    const result = await heartbeat.tickPullRequestDrift(new Date());
    expect(result.checked).toBeGreaterThan(0);
    expect(result.drifted).toBeGreaterThan(0);

    const updatedWorkspace = await db
      .select()
      .from(executionWorkspaces)
      .where(eq(executionWorkspaces.id, workspace.id))
      .then((rows) => rows[0]);

    expect(updatedWorkspace?.syncStatus).toBe("drifted");
    expect(updatedWorkspace?.lastDriftDetectedAt).toBeTruthy();
    expect(updatedWorkspace?.conflictSummary).toMatchObject({
      branch: `feature/${ticketKey}`,
      baseBranch: "main",
    });
    const recoveryWakeups = await db
      .select()
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.agentId, assigneeAgentId));
    const recoveryWakeup = recoveryWakeups.find((request) => request.reason === "execution_workspace_conflict_recovery");
    expect(recoveryWakeup).toBeTruthy();
    expect(recoveryWakeup?.payload).toMatchObject({
      issueId: parentIssueId,
      executionWorkspaceId: workspace.id,
    });
  }, 120_000);
});
