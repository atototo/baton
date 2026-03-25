import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentInstructionsService } from "../services/agent-instructions.js";

const COMPANY_ID = "company-1";
const AGENT_ID = "agent-1";

function createAgent(adapterConfig: Record<string, unknown>) {
  return {
    id: AGENT_ID,
    companyId: COMPANY_ID,
    name: "scorpio-fe-dev",
    adapterConfig,
  };
}

async function listManagedFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string, prefix = ""): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(currentPath, entry.name), relativePath);
        continue;
      }
      if (entry.isFile()) results.push(relativePath);
    }
  }

  await walk(rootPath);
  return results.sort((left, right) => left.localeCompare(right));
}

describe("agent instructions managed cleanup", () => {
  let tempRoot = "";
  let previousBatonHome: string | undefined;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "baton-agent-instructions-"));
    previousBatonHome = process.env.BATON_HOME;
    process.env.BATON_HOME = path.join(tempRoot, ".baton-home");
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

    const service = agentInstructionsService();
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
    expect(await fs.readFile(path.join(managedRoot, "AGENTS.md"), "utf8")).toBe("# entry\n");
    expect(await listManagedFiles(managedRoot)).toEqual(["AGENTS.md"]);
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

    const service = agentInstructionsService();
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
    expect(await fs.readFile(path.join(managedRoot, "AGENTS.md"), "utf8")).toBe("# keep me\n");
    expect(await listManagedFiles(managedRoot)).toEqual(["AGENTS.md"]);
  });
});
