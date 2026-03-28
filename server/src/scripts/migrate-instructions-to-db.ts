/**
 * migrate-instructions-to-db.ts
 *
 * One-time migration script: reads managed-mode instruction files from the
 * filesystem and inserts them into the agent_instructions table.
 *
 * Usage:
 *   pnpm --filter @atototo/server migrate:instructions
 *
 * Environment variables (same as the server):
 *   DATABASE_URL   – connection string for an external PostgreSQL instance
 *                    (if not set, the script falls back to the embedded-postgres
 *                    connection string used by the default baton config)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb, agents as agentsTable, agentInstructions } from "@atototo/db";
import { resolveBatonInstanceRoot } from "../home-paths.js";
import { resolveBatonEnvPath } from "../paths.js";

// ---------------------------------------------------------------------------
// Bootstrap: load .env (same as the server does via config.ts)
// ---------------------------------------------------------------------------
const envPath = resolveBatonEnvPath();
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false, quiet: true });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const IGNORED_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", "Desktop.ini"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".nox",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  "__pycache__",
  "node_modules",
  "venv",
]);

const ENTRY_FILE_DEFAULT = "AGENTS.md";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Recursively list all files under `rootDir`, relative to `rootDir`.
 * Skips hidden/ignored directories and files.
 */
async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name as string;
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(name)) continue;
        await walk(path.join(dir, name), prefix ? `${prefix}/${name}` : name);
      } else if (entry.isFile()) {
        if (IGNORED_FILE_NAMES.has(name)) continue;
        results.push(prefix ? `${prefix}/${name}` : name);
      }
    }
  }

  await walk(rootDir, "");
  return results;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return fallback;
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

function buildConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Fall back to the embedded-postgres default that the server uses.
  // The port is 54329 (server default), database name is "baton".
  const port = Number(process.env.BATON_EMBEDDED_POSTGRES_PORT) || 54329;
  return `postgres://baton:baton@127.0.0.1:${port}/baton`;
}

// ---------------------------------------------------------------------------
// Main migration logic
// ---------------------------------------------------------------------------

async function migrateAgent(
  db: ReturnType<typeof createDb>,
  agent: { id: string; companyId: string; name: string; adapterConfig: Record<string, unknown> },
): Promise<{ migrated: number; skipped: number }> {
  const instanceRoot = resolveBatonInstanceRoot();
  const managedRoot = path.resolve(
    instanceRoot,
    "companies",
    agent.companyId,
    "agents",
    agent.id,
    "instructions",
  );

  // Determine the entry file from adapterConfig (same logic as agent-instructions service)
  const entryFile = asString(agent.adapterConfig.instructionsEntryFile, ENTRY_FILE_DEFAULT);

  // Check the managed root exists
  let rootStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    rootStat = await fs.stat(managedRoot);
  } catch {
    // Directory doesn't exist – nothing to migrate for this agent
    console.log(
      `  [SKIP] agent=${agent.id} name="${agent.name}" — managed root does not exist (${managedRoot})`,
    );
    return { migrated: 0, skipped: 0 };
  }

  if (!rootStat.isDirectory()) {
    console.log(
      `  [SKIP] agent=${agent.id} name="${agent.name}" — managed root is not a directory (${managedRoot})`,
    );
    return { migrated: 0, skipped: 0 };
  }

  const relativePaths = await listFilesRecursive(managedRoot);
  if (relativePaths.length === 0) {
    console.log(
      `  [SKIP] agent=${agent.id} name="${agent.name}" — no files found in managed root (${managedRoot})`,
    );
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;
  const now = new Date();

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(managedRoot, relativePath);
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch (err) {
      console.warn(`  [WARN] Failed to read file ${absolutePath}:`, err);
      skipped++;
      continue;
    }

    const contentHash = computeContentHash(content);
    const isEntryFile = relativePath === entryFile;

    try {
      await db
        .insert(agentInstructions)
        .values({
          companyId: agent.companyId,
          agentId: agent.id,
          path: relativePath,
          content,
          isEntryFile,
          source: "managed",
          contentHash,
          syncedFrom: absolutePath,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      console.log(`    [OK] ${relativePath}${isEntryFile ? " (entry)" : ""}`);
      migrated++;
    } catch (err) {
      console.warn(`  [WARN] Failed to insert ${relativePath} for agent ${agent.id}:`, err);
      skipped++;
    }
  }

  return { migrated, skipped };
}

async function main(): Promise<void> {
  const connectionString = buildConnectionString();
  console.log(`Connecting to database...`);
  console.log(`  connection: ${connectionString.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);

  const db = createDb(connectionString);

  // Fetch all agents
  console.log("\nFetching all agents from the database...");
  const allAgents = await db
    .select({
      id: agentsTable.id,
      companyId: agentsTable.companyId,
      name: agentsTable.name,
      adapterConfig: agentsTable.adapterConfig,
    })
    .from(agentsTable);

  console.log(`Found ${allAgents.length} agents total.`);

  // Filter to managed-mode agents
  const managedAgents = allAgents.filter((agent) => {
    const config = (agent.adapterConfig ?? {}) as Record<string, unknown>;
    return asString(config.instructionsBundleMode) === "managed";
  });

  console.log(`Of which ${managedAgents.length} agent(s) use instructionsBundleMode="managed".\n`);

  if (managedAgents.length === 0) {
    console.log("Nothing to migrate.");
    process.exit(0);
  }

  let totalMigrated = 0;
  let totalSkipped = 0;

  for (const agent of managedAgents) {
    console.log(`Processing agent: id=${agent.id}  name="${agent.name}"`);
    const result = await migrateAgent(
      db,
      agent as { id: string; companyId: string; name: string; adapterConfig: Record<string, unknown> },
    );
    totalMigrated += result.migrated;
    totalSkipped += result.skipped;
    console.log(
      `  => migrated=${result.migrated} skipped=${result.skipped}\n`,
    );
  }

  console.log("─".repeat(60));
  console.log(`Migration complete.`);
  console.log(`  Total files migrated : ${totalMigrated}`);
  console.log(`  Total files skipped  : ${totalSkipped}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
