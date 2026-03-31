import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, heartbeatRuns } from "@atototo/db";
import { heartbeatService } from "../services/heartbeat.js";

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

describe("heartbeat inbox summary", () => {
  let tempRoot = "";
  let db: any;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-heartbeat-inbox-summary-"));
    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        agents,
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

  it("returns only recent latest failed runs per active agent", async () => {
    const companyId = randomUUID();
    const failedAgentId = randomUUID();
    const recoveredAgentId = randomUUID();
    const oldFailureAgentId = randomUUID();
    const terminatedAgentId = randomUUID();
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    await db.insert(companies).values({
      id: companyId,
      name: "Heartbeat Inbox Co",
      issuePrefix: "HBI",
      issueCounter: 1,
      locale: "en",
    });

    await db.insert(agents).values([
      {
        id: failedAgentId,
        companyId,
        name: "failed-agent",
        role: "engineer",
        status: "error",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: recoveredAgentId,
        companyId,
        name: "recovered-agent",
        role: "engineer",
        status: "idle",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: oldFailureAgentId,
        companyId,
        name: "old-failure-agent",
        role: "engineer",
        status: "error",
        adapterType: "codex_local",
        adapterConfig: {},
      },
      {
        id: terminatedAgentId,
        companyId,
        name: "terminated-agent",
        role: "engineer",
        status: "terminated",
        adapterType: "codex_local",
        adapterConfig: {},
      },
    ]);

    await db.insert(heartbeatRuns).values([
      {
        id: randomUUID(),
        companyId,
        agentId: failedAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        companyId,
        agentId: recoveredAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: new Date(Date.now() - 60 * 1000),
      },
      {
        id: randomUUID(),
        companyId,
        agentId: recoveredAgentId,
        status: "succeeded",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        companyId,
        agentId: oldFailureAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: twentyFiveHoursAgo,
      },
      {
        id: randomUUID(),
        companyId,
        agentId: terminatedAgentId,
        status: "failed",
        invocationSource: "assignment",
        triggerDetail: null,
        createdAt: new Date(),
      },
    ]);

    const runs = await heartbeatService(db).listInboxFailedRuns(companyId);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.agentId).toBe(failedAgentId);
    expect(runs[0]?.status).toBe("failed");
  });
});
