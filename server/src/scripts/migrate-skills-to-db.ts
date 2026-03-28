/**
 * migrate-skills-to-db.ts
 *
 * One-time migration script: reads baton skill files from the skills/baton/
 * directory and inserts them into the skill_files table for each company.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." pnpm exec tsx src/scripts/migrate-skills-to-db.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { sql } from "drizzle-orm";
import { createDb, companies as companiesTable, skillFiles } from "@atototo/db";
import { resolveBatonEnvPath } from "../paths.js";

// ---------------------------------------------------------------------------
// Bootstrap: load .env
// ---------------------------------------------------------------------------
const envPath = resolveBatonEnvPath();
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, override: false, quiet: true });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SKILL_NAME = "baton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Recursively list all files under `rootDir`, relative to `rootDir`.
 */
async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const IGNORED = new Set([".DS_Store", "Thumbs.db"]);

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
        await walk(path.join(dir, name), prefix ? `${prefix}/${name}` : name);
      } else if (entry.isFile() && !IGNORED.has(name)) {
        results.push(prefix ? `${prefix}/${name}` : name);
      }
    }
  }

  await walk(rootDir, "");
  return results;
}

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------

function buildConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const port = Number(process.env.BATON_EMBEDDED_POSTGRES_PORT) || 54329;
  return `postgres://baton:baton@127.0.0.1:${port}/baton`;
}

// ---------------------------------------------------------------------------
// Main migration logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const connectionString = buildConnectionString();
  console.log(`Connecting to database...`);
  console.log(`  connection: ${connectionString.replace(/:\/\/[^@]+@/, "://<credentials>@")}`);

  const db = createDb(connectionString);

  // Resolve skill files directory (skills/baton/ relative to project root)
  const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const skillDir = path.join(projectRoot, "skills", SKILL_NAME);

  if (!existsSync(skillDir)) {
    console.error(`Skill directory not found: ${skillDir}`);
    process.exit(1);
  }

  // List all skill files
  const relativePaths = await listFilesRecursive(skillDir);
  if (relativePaths.length === 0) {
    console.log("No skill files found.");
    process.exit(0);
  }

  console.log(`Found ${relativePaths.length} skill file(s) in ${skillDir}:`);
  for (const p of relativePaths) {
    console.log(`  - ${p}`);
  }

  // Read all file contents
  const fileContents: Array<{ path: string; content: string; contentHash: string }> = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(skillDir, relativePath);
    const content = await fs.readFile(absolutePath, "utf8");
    fileContents.push({
      path: relativePath,
      content,
      contentHash: computeContentHash(content),
    });
  }

  // Fetch all companies
  console.log("\nFetching companies...");
  const allCompanies = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable);

  console.log(`Found ${allCompanies.length} company(ies).\n`);

  if (allCompanies.length === 0) {
    console.log("No companies found. Nothing to migrate.");
    process.exit(0);
  }

  let totalInserted = 0;
  const now = new Date();

  for (const company of allCompanies) {
    console.log(`Processing company: id=${company.id} name="${company.name}"`);

    for (const file of fileContents) {
      try {
        await db
          .insert(skillFiles)
          .values({
            companyId: company.id,
            skillName: SKILL_NAME,
            path: file.path,
            content: file.content,
            contentHash: file.contentHash,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [skillFiles.companyId, skillFiles.skillName, skillFiles.path],
            set: {
              content: sql`excluded.content`,
              contentHash: sql`excluded.content_hash`,
              updatedAt: sql`excluded.updated_at`,
            },
          });

        console.log(`  [OK] ${file.path}`);
        totalInserted++;
      } catch (err) {
        console.warn(`  [WARN] Failed to upsert ${file.path} for company ${company.id}:`, err);
      }
    }

    console.log();
  }

  console.log("─".repeat(60));
  console.log(`Migration complete.`);
  console.log(`  Total files upserted: ${totalInserted}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
