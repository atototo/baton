import fs from "node:fs/promises";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { agentInstructions, agentInstructionRevisions } from "@atototo/db";
import { instructionsCache, computeContentHash, type CachedBundle } from "./instructions-cache.js";
import { notFound, unprocessable } from "../errors.js";
import { resolveHomeAwarePath, resolveBatonInstanceRoot } from "../home-paths.js";

const ENTRY_FILE_DEFAULT = "AGENTS.md";
const MODE_KEY = "instructionsBundleMode";
const ROOT_KEY = "instructionsRootPath";
const ENTRY_KEY = "instructionsEntryFile";
const FILE_KEY = "instructionsFilePath";
const PROMPT_KEY = "promptTemplate";
const BOOTSTRAP_PROMPT_KEY = "bootstrapPromptTemplate";
const LEGACY_PROMPT_TEMPLATE_PATH = "promptTemplate.legacy.md";
const IGNORED_INSTRUCTIONS_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", "Desktop.ini"]);
const IGNORED_INSTRUCTIONS_DIRECTORY_NAMES = new Set([
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

type BundleMode = "managed" | "external";

type AgentLike = {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: unknown;
};

type AgentInstructionsFileSummary = {
  path: string;
  size: number;
  language: string;
  markdown: boolean;
  isEntryFile: boolean;
  editable: boolean;
  deprecated: boolean;
  virtual: boolean;
};

type AgentInstructionsFileDetail = AgentInstructionsFileSummary & {
  content: string;
  editable: boolean;
};

type AgentInstructionsBundle = {
  agentId: string;
  companyId: string;
  mode: BundleMode | null;
  rootPath: string | null;
  managedRootPath: string;
  entryFile: string;
  resolvedEntryPath: string | null;
  editable: boolean;
  warnings: string[];
  legacyPromptTemplateActive: boolean;
  legacyBootstrapPromptTemplateActive: boolean;
  files: AgentInstructionsFileSummary[];
};

type BundleState = {
  config: Record<string, unknown>;
  mode: BundleMode | null;
  rootPath: string | null;
  entryFile: string;
  resolvedEntryPath: string | null;
  warnings: string[];
  legacyPromptTemplateActive: boolean;
  legacyBootstrapPromptTemplateActive: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isBundleMode(value: unknown): value is BundleMode {
  return value === "managed" || value === "external";
}

function inferLanguage(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  if (lower.endsWith(".sh")) return "bash";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".txt")) return "text";
  return "text";
}

function isMarkdown(relativePath: string) {
  return relativePath.toLowerCase().endsWith(".md");
}

function normalizeRelativeFilePath(candidatePath: string): string {
  const normalized = path.posix.normalize(candidatePath.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw unprocessable("Instructions file path must stay within the bundle root");
  }
  return normalized;
}

function resolvePathWithinRoot(rootPath: string, relativePath: string): string {
  const normalizedRelativePath = normalizeRelativeFilePath(relativePath);
  const absoluteRoot = path.resolve(rootPath);
  const absolutePath = path.resolve(absoluteRoot, normalizedRelativePath);
  const relativeToRoot = path.relative(absoluteRoot, absolutePath);
  if (relativeToRoot === ".." || relativeToRoot.startsWith(`..${path.sep}`)) {
    throw unprocessable("Instructions file path must stay within the bundle root");
  }
  return absolutePath;
}

function resolveManagedInstructionsRoot(agent: AgentLike): string {
  return path.resolve(
    resolveBatonInstanceRoot(),
    "companies",
    agent.companyId,
    "agents",
    agent.id,
    "instructions",
  );
}

function resolveLegacyInstructionsPath(candidatePath: string, config: Record<string, unknown>): string {
  if (path.isAbsolute(candidatePath)) return candidatePath;
  const cwd = asString(config.cwd);
  if (!cwd || !path.isAbsolute(cwd)) {
    throw unprocessable(
      "Legacy relative instructionsFilePath requires adapterConfig.cwd to be set to an absolute path",
    );
  }
  return path.resolve(cwd, candidatePath);
}

async function statIfExists(targetPath: string) {
  return fs.stat(targetPath).catch(() => null);
}

function shouldIgnoreInstructionsEntry(entry: { name: string; isDirectory(): boolean; isFile(): boolean }) {
  if (entry.name === "." || entry.name === "..") return true;
  if (entry.isDirectory()) {
    return IGNORED_INSTRUCTIONS_DIRECTORY_NAMES.has(entry.name);
  }
  if (!entry.isFile()) return false;
  return (
    IGNORED_INSTRUCTIONS_FILE_NAMES.has(entry.name)
    || entry.name.startsWith("._")
    || entry.name.endsWith(".pyc")
    || entry.name.endsWith(".pyo")
  );
}

async function listFilesRecursive(rootPath: string): Promise<string[]> {
  const output: string[] = [];

  async function walk(currentPath: string, relativeDir: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (shouldIgnoreInstructionsEntry(entry)) continue;
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = normalizeRelativeFilePath(
        relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name,
      );
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      output.push(relativePath);
    }
  }

  await walk(rootPath, "");
  return output.sort((left, right) => left.localeCompare(right));
}

async function readLegacyInstructions(agent: AgentLike, config: Record<string, unknown>): Promise<string> {
  const instructionsFilePath = asString(config[FILE_KEY]);
  if (instructionsFilePath) {
    try {
      const resolvedPath = resolveLegacyInstructionsPath(instructionsFilePath, config);
      return await fs.readFile(resolvedPath, "utf8");
    } catch {
      // Fall back to promptTemplate below.
    }
  }
  return asString(config[PROMPT_KEY]) ?? "";
}

function deriveBundleState(agent: AgentLike): BundleState {
  const config = asRecord(agent.adapterConfig);
  const warnings: string[] = [];
  const storedModeRaw = config[MODE_KEY];
  const storedRootRaw = asString(config[ROOT_KEY]);
  const legacyInstructionsPath = asString(config[FILE_KEY]);

  let mode: BundleMode | null = isBundleMode(storedModeRaw) ? storedModeRaw : null;
  let rootPath = storedRootRaw ? resolveHomeAwarePath(storedRootRaw) : null;
  let entryFile = ENTRY_FILE_DEFAULT;

  const storedEntryRaw = asString(config[ENTRY_KEY]);
  if (storedEntryRaw) {
    try {
      entryFile = normalizeRelativeFilePath(storedEntryRaw);
    } catch {
      warnings.push(`Ignored invalid instructions entry file "${storedEntryRaw}".`);
    }
  }

  if (!rootPath && legacyInstructionsPath) {
    try {
      const resolvedLegacyPath = resolveLegacyInstructionsPath(legacyInstructionsPath, config);
      rootPath = path.dirname(resolvedLegacyPath);
      entryFile = path.basename(resolvedLegacyPath);
      mode = resolvedLegacyPath.startsWith(`${resolveManagedInstructionsRoot(agent)}${path.sep}`)
        || resolvedLegacyPath === path.join(resolveManagedInstructionsRoot(agent), entryFile)
        ? "managed"
        : "external";
      if (!path.isAbsolute(legacyInstructionsPath)) {
        warnings.push("Using legacy relative instructionsFilePath; migrate this agent to a managed or absolute external bundle.");
      }
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  const resolvedEntryPath = rootPath ? path.resolve(rootPath, entryFile) : null;

  return {
    config,
    mode,
    rootPath,
    entryFile,
    resolvedEntryPath,
    warnings,
    legacyPromptTemplateActive: Boolean(asString(config[PROMPT_KEY])),
    legacyBootstrapPromptTemplateActive: Boolean(asString(config[BOOTSTRAP_PROMPT_KEY])),
  };
}

function toBundle(agent: AgentLike, state: BundleState, files: AgentInstructionsFileSummary[]): AgentInstructionsBundle {
  const nextFiles = [...files];
  if (state.legacyPromptTemplateActive && !nextFiles.some((file) => file.path === LEGACY_PROMPT_TEMPLATE_PATH)) {
    const legacyPromptTemplate = asString(state.config[PROMPT_KEY]) ?? "";
    nextFiles.push({
      path: LEGACY_PROMPT_TEMPLATE_PATH,
      size: legacyPromptTemplate.length,
      language: "markdown",
      markdown: true,
      isEntryFile: false,
      editable: true,
      deprecated: true,
      virtual: true,
    });
  }
  nextFiles.sort((left, right) => left.path.localeCompare(right.path));
  return {
    agentId: agent.id,
    companyId: agent.companyId,
    mode: state.mode,
    rootPath: state.rootPath,
    managedRootPath: resolveManagedInstructionsRoot(agent),
    entryFile: state.entryFile,
    resolvedEntryPath: state.resolvedEntryPath,
    editable: Boolean(state.rootPath),
    warnings: state.warnings,
    legacyPromptTemplateActive: state.legacyPromptTemplateActive,
    legacyBootstrapPromptTemplateActive: state.legacyBootstrapPromptTemplateActive,
    files: nextFiles,
  };
}

function applyBundleConfig(
  config: Record<string, unknown>,
  input: {
    mode: BundleMode;
    rootPath: string;
    entryFile: string;
    clearLegacyPromptTemplate?: boolean;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...config,
    [MODE_KEY]: input.mode,
    [ROOT_KEY]: input.rootPath,
    [ENTRY_KEY]: input.entryFile,
    [FILE_KEY]: path.resolve(input.rootPath, input.entryFile),
  };
  if (input.clearLegacyPromptTemplate) {
    delete next[PROMPT_KEY];
    delete next[BOOTSTRAP_PROMPT_KEY];
  }
  return next;
}

function buildPersistedBundleConfig(
  derived: BundleState,
  current: BundleState,
  options?: { clearLegacyPromptTemplate?: boolean },
): Record<string, unknown> {
  const currentRootPath = current.rootPath ? path.resolve(current.rootPath) : null;
  const derivedRootPath = derived.rootPath ? path.resolve(derived.rootPath) : null;
  const configMatchesRecoveredState =
    derived.mode === current.mode
    && derivedRootPath !== null
    && currentRootPath !== null
    && derivedRootPath === currentRootPath
    && derived.entryFile === current.entryFile;

  if (configMatchesRecoveredState && !options?.clearLegacyPromptTemplate) {
    return current.config;
  }

  if (!current.rootPath || !current.mode) {
    return current.config;
  }

  return applyBundleConfig(current.config, {
    mode: current.mode,
    rootPath: current.rootPath,
    entryFile: current.entryFile,
    clearLegacyPromptTemplate: options?.clearLegacyPromptTemplate,
  });
}

export function syncInstructionsBundleConfigFromFilePath(
  agent: AgentLike,
  adapterConfig: Record<string, unknown>,
): Record<string, unknown> {
  const instructionsFilePath = asString(adapterConfig[FILE_KEY]);
  const next = { ...adapterConfig };
  if (!instructionsFilePath) {
    delete next[MODE_KEY];
    delete next[ROOT_KEY];
    delete next[ENTRY_KEY];
    return next;
  }
  const resolvedPath = resolveLegacyInstructionsPath(instructionsFilePath, adapterConfig);
  const rootPath = path.dirname(resolvedPath);
  const entryFile = path.basename(resolvedPath);
  const mode: BundleMode = resolvedPath.startsWith(`${resolveManagedInstructionsRoot(agent)}${path.sep}`)
    || resolvedPath === path.join(resolveManagedInstructionsRoot(agent), entryFile)
    ? "managed"
    : "external";
  return applyBundleConfig(next, { mode, rootPath, entryFile });
}

// ---------------------------------------------------------------------------
// DB-backed service factory
// ---------------------------------------------------------------------------

export function agentInstructionsService(db: Db) {
  const cache = instructionsCache();

  // -- helpers to convert DB rows to file summaries/details --

  function rowToSummary(row: { path: string; content: string; isEntryFile: boolean }): AgentInstructionsFileSummary {
    return {
      path: row.path,
      size: Buffer.byteLength(row.content, "utf8"),
      language: inferLanguage(row.path),
      markdown: isMarkdown(row.path),
      isEntryFile: row.isEntryFile,
      editable: true,
      deprecated: false,
      virtual: false,
    };
  }

  function rowToDetail(row: { path: string; content: string; isEntryFile: boolean }): AgentInstructionsFileDetail {
    return {
      ...rowToSummary(row),
      content: row.content,
    };
  }

  // -- core CRUD --

  async function getBundle(agent: AgentLike): Promise<AgentInstructionsBundle> {
    const state = deriveBundleState(agent);

    // Query DB rows for this agent
    const rows = await db.select().from(agentInstructions).where(eq(agentInstructions.agentId, agent.id));

    if (rows.length > 0) {
      // DB has instructions — build bundle from DB rows
      const summaries = rows.map(rowToSummary);
      return toBundle(agent, state, summaries);
    }

    // No DB rows: fall back to filesystem recovery (backward compat during migration)
    if (!state.rootPath) return toBundle(agent, state, []);
    const stat = await statIfExists(state.rootPath);
    if (!stat?.isDirectory()) {
      return toBundle(agent, {
        ...state,
        warnings: [...state.warnings, `Instructions root does not exist: ${state.rootPath}`],
      }, []);
    }
    // External mode: only show the entry file to avoid exposing entire project directory
    if (state.mode === "external") {
      const entryPath = state.entryFile ? resolvePathWithinRoot(state.rootPath, state.entryFile) : null;
      if (entryPath) {
        const entryStat = await statIfExists(entryPath);
        if (entryStat?.isFile()) {
          const content = await fs.readFile(entryPath, "utf8");
          return toBundle(agent, state, [{
            path: state.entryFile,
            size: entryStat.size,
            language: inferLanguage(state.entryFile),
            markdown: isMarkdown(state.entryFile),
            isEntryFile: true,
            editable: true,
            deprecated: false,
            virtual: false,
          }]);
        }
      }
      return toBundle(agent, state, []);
    }
    // Managed mode fs fallback
    const filePaths = await listFilesRecursive(state.rootPath);
    const summaries = await Promise.all(filePaths.map(async (relativePath) => {
      const absolutePath = resolvePathWithinRoot(state.rootPath!, relativePath);
      const fsStat = await fs.stat(absolutePath);
      return {
        path: relativePath,
        size: fsStat.size,
        language: inferLanguage(relativePath),
        markdown: isMarkdown(relativePath),
        isEntryFile: relativePath === state.entryFile,
        editable: true,
        deprecated: false,
        virtual: false,
      } satisfies AgentInstructionsFileSummary;
    }));
    return toBundle(agent, state, summaries);
  }

  async function readFile(agent: AgentLike, relativePath: string): Promise<AgentInstructionsFileDetail> {
    const state = deriveBundleState(agent);

    // Legacy promptTemplate pseudo-file
    if (relativePath === LEGACY_PROMPT_TEMPLATE_PATH) {
      const content = asString(state.config[PROMPT_KEY]);
      if (content === null) throw notFound("Instructions file not found");
      return {
        path: LEGACY_PROMPT_TEMPLATE_PATH,
        size: content.length,
        language: "markdown",
        markdown: true,
        isEntryFile: false,
        editable: true,
        deprecated: true,
        virtual: true,
        content,
      };
    }

    const normalizedPath = normalizeRelativeFilePath(relativePath);

    // Query DB first
    const row = await db.select().from(agentInstructions)
      .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.path, normalizedPath)))
      .limit(1).then(r => r[0]);

    if (row) {
      return rowToDetail(row);
    }

    // Filesystem fallback for migration
    if (!state.rootPath) throw notFound("Instructions file not found");
    const absolutePath = resolvePathWithinRoot(state.rootPath, normalizedPath);
    const [content, fsStat] = await Promise.all([
      fs.readFile(absolutePath, "utf8").catch(() => null),
      fs.stat(absolutePath).catch(() => null),
    ]);
    if (content === null || !fsStat?.isFile()) throw notFound("Instructions file not found");
    return {
      path: normalizedPath,
      size: fsStat.size,
      language: inferLanguage(normalizedPath),
      markdown: isMarkdown(normalizedPath),
      isEntryFile: normalizedPath === state.entryFile,
      editable: true,
      deprecated: false,
      virtual: false,
      content,
    };
  }

  async function ensureWritableBundle(
    agent: AgentLike,
    options?: { clearLegacyPromptTemplate?: boolean },
  ): Promise<{ adapterConfig: Record<string, unknown>; state: BundleState }> {
    const derived = deriveBundleState(agent);

    // Check if DB already has rows for this agent
    const existingRows = await db.select({ id: agentInstructions.id }).from(agentInstructions)
      .where(eq(agentInstructions.agentId, agent.id)).limit(1);

    if (existingRows.length > 0 && derived.rootPath && derived.mode) {
      // DB rows exist, bundle is already writable
      const adapterConfig = buildPersistedBundleConfig(derived, derived, options);
      return {
        adapterConfig,
        state: deriveBundleState({ ...agent, adapterConfig }),
      };
    }

    // No DB rows yet — create managed bundle entry from legacy content
    const managedRoot = resolveManagedInstructionsRoot(agent);
    const entryFile = derived.entryFile || ENTRY_FILE_DEFAULT;
    const nextConfig = applyBundleConfig(derived.config, {
      mode: "managed",
      rootPath: managedRoot,
      entryFile,
      clearLegacyPromptTemplate: options?.clearLegacyPromptTemplate,
    });

    // Seed the DB with legacy content if no rows exist
    if (existingRows.length === 0) {
      const legacyInstructions = await readLegacyInstructions(agent, derived.config);
      const content = legacyInstructions.trim().length > 0 ? legacyInstructions : "";
      if (content.length > 0) {
        await db.insert(agentInstructions).values({
          companyId: agent.companyId,
          agentId: agent.id,
          path: entryFile,
          content,
          isEntryFile: true,
          source: "managed",
          contentHash: computeContentHash(content),
        }).onConflictDoUpdate({
          target: [agentInstructions.agentId, agentInstructions.path],
          set: { content, contentHash: computeContentHash(content), isEntryFile: true, updatedAt: new Date() },
        });
        cache.invalidate(agent.id);
      }
    }

    return {
      adapterConfig: nextConfig,
      state: deriveBundleState({ ...agent, adapterConfig: nextConfig }),
    };
  }

  async function updateBundle(
    agent: AgentLike,
    input: {
      mode?: BundleMode;
      rootPath?: string | null;
      entryFile?: string;
      clearLegacyPromptTemplate?: boolean;
      replaceExisting?: boolean;
    },
  ): Promise<{ bundle: AgentInstructionsBundle; adapterConfig: Record<string, unknown> }> {
    const state = deriveBundleState(agent);
    const nextMode = input.mode ?? state.mode ?? "managed";
    const nextEntryFile = input.entryFile ? normalizeRelativeFilePath(input.entryFile) : state.entryFile;
    let nextRootPath: string;

    if (nextMode === "managed") {
      nextRootPath = resolveManagedInstructionsRoot(agent);
    } else {
      const rootPath = asString(input.rootPath) ?? state.rootPath;
      if (!rootPath) {
        throw unprocessable("External instructions bundles require an absolute rootPath");
      }
      const resolvedRoot = resolveHomeAwarePath(rootPath);
      if (!path.isAbsolute(resolvedRoot)) {
        throw unprocessable("External instructions bundles require an absolute rootPath");
      }
      nextRootPath = resolvedRoot;
    }

    const replaceExisting = input.replaceExisting === true;

    if (replaceExisting && nextMode === "managed") {
      // Read current entry content before clearing
      let replacementContent: string | null = null;
      const currentEntryRow = await db.select().from(agentInstructions)
        .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.isEntryFile, true)))
        .limit(1).then(r => r[0]);
      replacementContent = currentEntryRow?.content ?? null;

      if (replacementContent === null && state.rootPath) {
        try {
          const entryPath = resolvePathWithinRoot(state.rootPath, state.entryFile);
          replacementContent = await fs.readFile(entryPath, "utf8");
        } catch { /* ignore */ }
      }
      if (replacementContent === null) {
        replacementContent = await readLegacyInstructions(agent, state.config);
      }

      // Clear all DB rows for this agent
      await db.delete(agentInstructions).where(eq(agentInstructions.agentId, agent.id));

      // Insert new entry file
      const content = replacementContent || "";
      await db.insert(agentInstructions).values({
        companyId: agent.companyId,
        agentId: agent.id,
        path: nextEntryFile,
        content,
        isEntryFile: true,
        source: "managed",
        contentHash: computeContentHash(content),
      });
    } else {
      // Ensure at least the entry file exists in DB
      const existingRows = await db.select().from(agentInstructions)
        .where(eq(agentInstructions.agentId, agent.id));

      if (existingRows.length === 0) {
        // Seed from export/legacy
        const exported = await exportFiles(agent);
        const entryContent = exported.files[nextEntryFile] ?? exported.files[exported.entryFile] ?? "";
        await db.insert(agentInstructions).values({
          companyId: agent.companyId,
          agentId: agent.id,
          path: nextEntryFile,
          content: entryContent,
          isEntryFile: true,
          source: "managed",
          contentHash: computeContentHash(entryContent),
        });
      } else if (!existingRows.some(r => r.path === nextEntryFile)) {
        // Entry file doesn't exist in DB yet — create it
        const exported = await exportFiles(agent);
        const entryContent = exported.files[nextEntryFile] ?? exported.files[exported.entryFile] ?? "";
        await db.insert(agentInstructions).values({
          companyId: agent.companyId,
          agentId: agent.id,
          path: nextEntryFile,
          content: entryContent,
          isEntryFile: true,
          source: "managed",
          contentHash: computeContentHash(entryContent),
        }).onConflictDoUpdate({
          target: [agentInstructions.agentId, agentInstructions.path],
          set: { content: entryContent, contentHash: computeContentHash(entryContent), isEntryFile: true, updatedAt: new Date() },
        });
      }

      // Update isEntryFile flags
      if (existingRows.length > 0) {
        // Clear old entry file flags
        for (const row of existingRows) {
          if (row.isEntryFile && row.path !== nextEntryFile) {
            await db.update(agentInstructions)
              .set({ isEntryFile: false, updatedAt: new Date() })
              .where(eq(agentInstructions.id, row.id));
          }
        }
        // Set new entry file flag
        const newEntryRow = existingRows.find(r => r.path === nextEntryFile);
        if (newEntryRow && !newEntryRow.isEntryFile) {
          await db.update(agentInstructions)
            .set({ isEntryFile: true, updatedAt: new Date() })
            .where(eq(agentInstructions.id, newEntryRow.id));
        }
      }
    }

    cache.invalidate(agent.id);

    const nextConfig = applyBundleConfig(state.config, {
      mode: nextMode,
      rootPath: nextRootPath,
      entryFile: nextEntryFile,
      clearLegacyPromptTemplate: input.clearLegacyPromptTemplate,
    });
    const nextBundle = await getBundle({ ...agent, adapterConfig: nextConfig });
    return { bundle: nextBundle, adapterConfig: nextConfig };
  }

  async function writeFile(
    agent: AgentLike,
    relativePath: string,
    content: string,
    options?: { clearLegacyPromptTemplate?: boolean },
  ): Promise<{
    bundle: AgentInstructionsBundle;
    file: AgentInstructionsFileDetail;
    adapterConfig: Record<string, unknown>;
  }> {
    const current = deriveBundleState(agent);

    // Legacy promptTemplate pseudo-file
    if (relativePath === LEGACY_PROMPT_TEMPLATE_PATH) {
      const adapterConfig: Record<string, unknown> = {
        ...current.config,
        [PROMPT_KEY]: content,
      };
      const nextAgent = { ...agent, adapterConfig };
      const [bundle, file] = await Promise.all([
        getBundle(nextAgent),
        readFile(nextAgent, LEGACY_PROMPT_TEMPLATE_PATH),
      ]);
      return { bundle, file, adapterConfig };
    }

    const prepared = await ensureWritableBundle(agent, options);
    const normalizedPath = normalizeRelativeFilePath(relativePath);
    const contentHash = computeContentHash(content);

    // Get existing row for revision tracking
    const existingRow = await db.select().from(agentInstructions)
      .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.path, normalizedPath)))
      .limit(1).then(r => r[0]);

    const isEntryFile = normalizedPath === prepared.state.entryFile;

    // Upsert to DB
    await db.insert(agentInstructions).values({
      companyId: agent.companyId,
      agentId: agent.id,
      path: normalizedPath,
      content,
      isEntryFile,
      source: "managed",
      contentHash,
    }).onConflictDoUpdate({
      target: [agentInstructions.agentId, agentInstructions.path],
      set: { content, contentHash, isEntryFile, updatedAt: new Date() },
    });

    // Record revision
    await db.insert(agentInstructionRevisions).values({
      companyId: agent.companyId,
      agentId: agent.id,
      path: normalizedPath,
      beforeContent: existingRow?.content ?? null,
      afterContent: content,
      changedBy: "user",
    });

    cache.invalidate(agent.id);

    const nextAgent = { ...agent, adapterConfig: prepared.adapterConfig };
    const [bundle, file] = await Promise.all([
      getBundle(nextAgent),
      readFile(nextAgent, relativePath),
    ]);
    return { bundle, file, adapterConfig: prepared.adapterConfig };
  }

  async function deleteFile(agent: AgentLike, relativePath: string): Promise<{
    bundle: AgentInstructionsBundle;
    adapterConfig: Record<string, unknown>;
  }> {
    const state = deriveBundleState(agent);

    if (relativePath === LEGACY_PROMPT_TEMPLATE_PATH) {
      throw unprocessable("Cannot delete the legacy promptTemplate pseudo-file");
    }

    const normalizedPath = normalizeRelativeFilePath(relativePath);
    if (normalizedPath === state.entryFile) {
      throw unprocessable("Cannot delete the bundle entry file");
    }

    // Get existing row for revision tracking
    const existingRow = await db.select().from(agentInstructions)
      .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.path, normalizedPath)))
      .limit(1).then(r => r[0]);

    if (!existingRow) {
      throw notFound("Instructions file not found");
    }

    // Delete from DB
    await db.delete(agentInstructions)
      .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.path, normalizedPath)));

    // Record revision
    await db.insert(agentInstructionRevisions).values({
      companyId: agent.companyId,
      agentId: agent.id,
      path: normalizedPath,
      beforeContent: existingRow.content,
      afterContent: null,
      changedBy: "user",
    });

    cache.invalidate(agent.id);

    const adapterConfig = buildPersistedBundleConfig(state, state);
    const bundle = await getBundle({ ...agent, adapterConfig });
    return { bundle, adapterConfig };
  }

  async function exportFiles(agent: AgentLike): Promise<{
    files: Record<string, string>;
    entryFile: string;
    warnings: string[];
  }> {
    const state = deriveBundleState(agent);

    // Query DB first
    const rows = await db.select().from(agentInstructions).where(eq(agentInstructions.agentId, agent.id));

    if (rows.length > 0) {
      const files = Object.fromEntries(rows.map(r => [r.path, r.content]));
      const entryRow = rows.find(r => r.isEntryFile);
      return {
        files,
        entryFile: entryRow?.path ?? state.entryFile,
        warnings: state.warnings,
      };
    }

    // Filesystem fallback
    if (state.rootPath) {
      const stat = await statIfExists(state.rootPath);
      if (stat?.isDirectory()) {
        const relativePaths = await listFilesRecursive(state.rootPath);
        const files = Object.fromEntries(await Promise.all(relativePaths.map(async (relativePath) => {
          const absolutePath = resolvePathWithinRoot(state.rootPath!, relativePath);
          const content = await fs.readFile(absolutePath, "utf8");
          return [relativePath, content] as const;
        })));
        if (Object.keys(files).length > 0) {
          return { files, entryFile: state.entryFile, warnings: state.warnings };
        }
      }
    }

    const legacyBody = await readLegacyInstructions(agent, state.config);
    return {
      files: { [state.entryFile]: legacyBody || "_No AGENTS instructions were resolved from current agent config._" },
      entryFile: state.entryFile,
      warnings: state.warnings,
    };
  }

  async function materializeManagedBundle(
    agent: AgentLike,
    files: Record<string, string>,
    options?: {
      clearLegacyPromptTemplate?: boolean;
      replaceExisting?: boolean;
      entryFile?: string;
    },
  ): Promise<{ bundle: AgentInstructionsBundle; adapterConfig: Record<string, unknown> }> {
    const rootPath = resolveManagedInstructionsRoot(agent);
    const entryFile = options?.entryFile ? normalizeRelativeFilePath(options.entryFile) : ENTRY_FILE_DEFAULT;

    if (options?.replaceExisting) {
      // Clear all existing DB rows for this agent
      await db.delete(agentInstructions).where(eq(agentInstructions.agentId, agent.id));
    }

    // Batch upsert all files to DB
    const normalizedEntries = Object.entries(files).map(([relativePath, content]) => [
      normalizeRelativeFilePath(relativePath),
      content,
    ] as const);

    for (const [normalizedPath, content] of normalizedEntries) {
      const contentHash = computeContentHash(content);
      await db.insert(agentInstructions).values({
        companyId: agent.companyId,
        agentId: agent.id,
        path: normalizedPath,
        content,
        isEntryFile: normalizedPath === entryFile,
        source: "managed",
        contentHash,
      }).onConflictDoUpdate({
        target: [agentInstructions.agentId, agentInstructions.path],
        set: { content, contentHash, isEntryFile: normalizedPath === entryFile, updatedAt: new Date() },
      });
    }

    // Ensure entry file exists
    if (!normalizedEntries.some(([p]) => p === entryFile)) {
      await db.insert(agentInstructions).values({
        companyId: agent.companyId,
        agentId: agent.id,
        path: entryFile,
        content: "",
        isEntryFile: true,
        source: "managed",
        contentHash: computeContentHash(""),
      }).onConflictDoUpdate({
        target: [agentInstructions.agentId, agentInstructions.path],
        set: { content: "", contentHash: computeContentHash(""), isEntryFile: true, updatedAt: new Date() },
      });
    }

    cache.invalidate(agent.id);

    const adapterConfig = applyBundleConfig(asRecord(agent.adapterConfig), {
      mode: "managed",
      rootPath,
      entryFile,
      clearLegacyPromptTemplate: options?.clearLegacyPromptTemplate,
    });
    const bundle = await getBundle({ ...agent, adapterConfig });
    return { bundle, adapterConfig };
  }

  // -- New: sync external files to DB --

  async function syncExternalFiles(agent: AgentLike): Promise<{ synced: boolean; path: string | null }> {
    const state = deriveBundleState(agent);
    if (state.mode !== "external" || !state.rootPath || !state.entryFile) {
      return { synced: false, path: null };
    }

    const entryPath = resolvePathWithinRoot(state.rootPath, state.entryFile);
    let content: string;
    try {
      content = await fs.readFile(entryPath, "utf8");
    } catch {
      return { synced: false, path: state.entryFile };
    }

    const contentHash = computeContentHash(content);

    // Check if DB content is already up to date
    const existingRow = await db.select().from(agentInstructions)
      .where(and(eq(agentInstructions.agentId, agent.id), eq(agentInstructions.path, state.entryFile)))
      .limit(1).then(r => r[0]);

    if (existingRow && existingRow.contentHash === contentHash) {
      return { synced: false, path: state.entryFile };
    }

    // Upsert to DB
    await db.insert(agentInstructions).values({
      companyId: agent.companyId,
      agentId: agent.id,
      path: state.entryFile,
      content,
      isEntryFile: true,
      source: "external_sync",
      contentHash,
      syncedFrom: entryPath,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: [agentInstructions.agentId, agentInstructions.path],
      set: {
        content,
        contentHash,
        isEntryFile: true,
        source: "external_sync",
        syncedFrom: entryPath,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Record revision
    await db.insert(agentInstructionRevisions).values({
      companyId: agent.companyId,
      agentId: agent.id,
      path: state.entryFile,
      beforeContent: existingRow?.content ?? null,
      afterContent: content,
      changedBy: "external_sync",
    });

    cache.invalidate(agent.id);
    return { synced: true, path: state.entryFile };
  }

  // -- New: load bundle for adapter execution --

  async function loadBundleForExecution(agentId: string): Promise<CachedBundle | null> {
    // Check cache first
    const cached = cache.get(agentId);
    if (cached) return cached;

    // Query all DB rows for this agent
    const rows = await db.select().from(agentInstructions).where(eq(agentInstructions.agentId, agentId));

    if (rows.length === 0) return null;

    // Build CachedBundle
    const files = new Map<string, string>();
    let entryFile = ENTRY_FILE_DEFAULT;
    const contentParts: string[] = [];

    for (const row of rows) {
      files.set(row.path, row.content);
      contentParts.push(row.content);
      if (row.isEntryFile) {
        entryFile = row.path;
      }
    }

    const bundleHash = computeContentHash(contentParts.sort().join("\n---\n"));
    const bundle: CachedBundle = {
      files,
      entryFile,
      hash: bundleHash,
      loadedAt: new Date(),
    };

    cache.set(agentId, bundle);
    return bundle;
  }

  return {
    getBundle,
    readFile,
    updateBundle,
    writeFile,
    deleteFile,
    exportFiles,
    ensureManagedBundle: ensureWritableBundle,
    materializeManagedBundle,
    syncExternalFiles,
    loadBundleForExecution,
  };
}
