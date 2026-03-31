import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, approvals, companies, heartbeatRuns } from "@atototo/db";
import { sidebarBadgeService } from "../services/sidebar-badges.js";

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

describe("sidebar badge service", () => {
  let tempRoot = "";
  let db: any;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-sidebar-badges-"));
    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        agents,
        approvals,
        companies,
        heartbeatRuns,
      },
    });
    await applyPgliteMigrations(client);
  });

  afterAll(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("counts only pending approvals and recent failed runs", async () => {
    const companyId = randomUUID();
    const recentFailedAgentId = randomUUID();
    const oldFailedAgentId = randomUUID();
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    await db.insert(companies).values({
      id: companyId,
      name: "Sidebar Badge Co",
      issuePrefix: "SBB",
      issueCounter: 1,
      locale: "en",
    });

    await db.insert(agents).values([
      {
        id: recentFailedAgentId,
        companyId,
        name: "recent-failure",
        role: "engineer",
        status: "error",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: oldFailedAgentId,
        companyId,
        name: "old-failure",
        role: "engineer",
        status: "error",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);

    await db.insert(approvals).values([
      {
        id: randomUUID(),
        companyId,
        type: "approve_issue_plan",
        requestedByAgentId: recentFailedAgentId,
        requestedByUserId: null,
        status: "pending",
        payload: {},
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        updatedAt: new Date(),
      },
      {
        id: randomUUID(),
        companyId,
        type: "approve_completion",
        requestedByAgentId: recentFailedAgentId,
        requestedByUserId: null,
        status: "revision_requested",
        payload: {},
        decisionNote: "needs changes",
        decidedByUserId: null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await db.insert(heartbeatRuns).values([
      {
        id: randomUUID(),
        companyId,
        agentId: recentFailedAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        companyId,
        agentId: oldFailedAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: twentyFiveHoursAgo,
      },
    ]);

    const badges = await sidebarBadgeService(db).get(companyId);
    expect(badges.approvals).toBe(1);
    expect(badges.failedRuns).toBe(1);
    expect(badges.inbox).toBe(2);
  });
});
