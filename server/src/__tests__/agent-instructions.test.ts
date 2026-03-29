import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentInstructionRevisions,
  agentInstructions,
  agents,
  companies,
} from "@atototo/db";
import { agentInstructionsService } from "../services/agent-instructions.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PGLITE_ENTRY = path.resolve(
  REPO_ROOT,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/index.js",
);
const MIGRATIONS_FOLDER = path.resolve(REPO_ROOT, "packages/db/src/migrations");

function createAgent(adapterConfig: Record<string, unknown>) {
  return {
    id: AGENT_ID,
    companyId: COMPANY_ID,
    name: "scorpio-fe-dev",
    adapterConfig,
  };
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

describe("agent instructions managed cleanup", () => {
  let tempRoot = "";
  let previousBatonHome: string | undefined;
  let db: any;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-agent-instructions-"));
    previousBatonHome = process.env.BATON_HOME;
    process.env.BATON_HOME = path.join(tempRoot, ".baton-home");

    const { PGlite } = await import(pathToFileURL(PGLITE_ENTRY).href);
    const client = new PGlite();
    db = drizzle(client, {
      schema: {
        companies,
        agents,
        agentInstructions,
        agentInstructionRevisions,
      },
    });
    await applyPgliteMigrations(client);

    await db.insert(companies).values({
      id: COMPANY_ID,
      name: "Instruction Co",
      issuePrefix: "INS",
      issueCounter: 0,
      locale: "ko",
    });
    await db.insert(agents).values({
      id: AGENT_ID,
      companyId: COMPANY_ID,
      name: "scorpio-fe-dev",
      role: "general",
      title: "Engineer",
      status: "paused",
      adapterType: "codex_local",
      adapterConfig: {},
    });
  });

  afterEach(async () => {
    if (previousBatonHome === undefined) delete process.env.BATON_HOME;
    else process.env.BATON_HOME = previousBatonHome;
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds the managed bundle with only the entry file when switching from external mode", async () => {
    const externalRoot = path.join(tempRoot, "external-project");
    const managedRoot = path.join(
      process.env.BATON_HOME!,
      "instances",
      "default",
      "companies",
      COMPANY_ID,
      "agents",
      AGENT_ID,
      "instructions",
    );

    await fs.mkdir(path.join(externalRoot, "nested"), { recursive: true });
    await fs.writeFile(path.join(externalRoot, "AGENTS.md"), "# entry\n", "utf8");
    await fs.writeFile(path.join(externalRoot, "nested", "other.md"), "should not copy\n", "utf8");

    await fs.mkdir(path.join(managedRoot, ".nuxt"), { recursive: true });
    await fs.writeFile(path.join(managedRoot, "AGENTS.md"), "stale entry\n", "utf8");
    await fs.writeFile(path.join(managedRoot, ".nuxt", "generated.txt"), "stale generated\n", "utf8");

    const service = agentInstructionsService(db);
    const { bundle } = await service.updateBundle(
      createAgent({
        instructionsBundleMode: "external",
        instructionsRootPath: externalRoot,
        instructionsEntryFile: "AGENTS.md",
        instructionsFilePath: path.join(externalRoot, "AGENTS.md"),
      }),
      { mode: "managed", replaceExisting: true } as never,
    );

    expect(bundle.mode).toBe("managed");
    expect(bundle.files.map((file) => file.path)).toEqual(["AGENTS.md"]);
    expect(bundle.rootPath).toBe(managedRoot);
    expect(await service.exportFiles(createAgent({
      instructionsBundleMode: "managed",
      instructionsRootPath: managedRoot,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(managedRoot, "AGENTS.md"),
    }))).toMatchObject({
      entryFile: "AGENTS.md",
      files: { "AGENTS.md": "# entry\n" },
    });
    expect(await fs.readFile(path.join(managedRoot, "AGENTS.md"), "utf8")).toBe("stale entry\n");
  });

  it("can clean an already managed bundle back down to the entry file", async () => {
    const managedRoot = path.join(
      process.env.BATON_HOME!,
      "instances",
      "default",
      "companies",
      COMPANY_ID,
      "agents",
      AGENT_ID,
      "instructions",
    );

    await fs.mkdir(path.join(managedRoot, "nested"), { recursive: true });
    await fs.writeFile(path.join(managedRoot, "AGENTS.md"), "# keep me\n", "utf8");
    await fs.writeFile(path.join(managedRoot, "nested", "secret.md"), "remove me\n", "utf8");

    const service = agentInstructionsService(db);
    const { bundle } = await service.updateBundle(
      createAgent({
        instructionsBundleMode: "managed",
        instructionsRootPath: managedRoot,
        instructionsEntryFile: "AGENTS.md",
        instructionsFilePath: path.join(managedRoot, "AGENTS.md"),
      }),
      { mode: "managed", replaceExisting: true } as never,
    );

    expect(bundle.mode).toBe("managed");
    expect(bundle.files.map((file) => file.path)).toEqual(["AGENTS.md"]);
    expect(bundle.rootPath).toBe(managedRoot);
    expect(await service.exportFiles(createAgent({
      instructionsBundleMode: "managed",
      instructionsRootPath: managedRoot,
      instructionsEntryFile: "AGENTS.md",
      instructionsFilePath: path.join(managedRoot, "AGENTS.md"),
    }))).toMatchObject({
      entryFile: "AGENTS.md",
      files: { "AGENTS.md": "# keep me\n" },
    });
    expect(await fs.readFile(path.join(managedRoot, "AGENTS.md"), "utf8")).toBe("# keep me\n");
    expect(await fs.readFile(path.join(managedRoot, "nested", "secret.md"), "utf8")).toBe("remove me\n");
  });
});
