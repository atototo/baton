import type { ServerAdapterModule } from "./types.js";
import {
  execute as claudeExecute,
  testEnvironment as claudeTestEnvironment,
  sessionCodec as claudeSessionCodec,
} from "@atototo/adapter-claude-local/server";
import { agentConfigurationDoc as claudeAgentConfigurationDoc, models as claudeModels } from "@atototo/adapter-claude-local";
import {
  execute as codexExecute,
  testEnvironment as codexTestEnvironment,
  sessionCodec as codexSessionCodec,
} from "@atototo/adapter-codex-local/server";
import { agentConfigurationDoc as codexAgentConfigurationDoc, models as codexModels } from "@atototo/adapter-codex-local";
import {
  execute as cursorExecute,
  testEnvironment as cursorTestEnvironment,
  sessionCodec as cursorSessionCodec,
} from "@atototo/adapter-cursor-local/server";
import { agentConfigurationDoc as cursorAgentConfigurationDoc, models as cursorModels } from "@atototo/adapter-cursor-local";
import {
  execute as opencodeExecute,
  testEnvironment as opencodeTestEnvironment,
  sessionCodec as opencodeSessionCodec,
} from "@atototo/adapter-opencode-local/server";
import { agentConfigurationDoc as opencodeAgentConfigurationDoc, models as opencodeModels } from "@atototo/adapter-opencode-local";
import {
  execute as geminiExecute,
  testEnvironment as geminiTestEnvironment,
  sessionCodec as geminiSessionCodec,
} from "@atototo/adapter-gemini-local/server";
import { agentConfigurationDoc as geminiAgentConfigurationDoc, models as geminiModels } from "@atototo/adapter-gemini-local";
import {
  execute as piExecute,
  testEnvironment as piTestEnvironment,
  sessionCodec as piSessionCodec,
} from "@atototo/adapter-pi-local/server";
import { agentConfigurationDoc as piAgentConfigurationDoc, models as piModels } from "@atototo/adapter-pi-local";
import { listPiModels } from "@atototo/adapter-pi-local/server";
import { listCodexModels } from "./codex-models.js";
import { listCursorModels } from "./cursor-models.js";
import { processAdapter } from "./process/index.js";
import { httpAdapter } from "./http/index.js";

const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeExecute,
  testEnvironment: claudeTestEnvironment,
  sessionCodec: claudeSessionCodec,
  models: claudeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: claudeAgentConfigurationDoc,
};

const codexLocalAdapter: ServerAdapterModule = {
  type: "codex_local",
  execute: codexExecute,
  testEnvironment: codexTestEnvironment,
  sessionCodec: codexSessionCodec,
  models: codexModels,
  listModels: listCodexModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: codexAgentConfigurationDoc,
};

const opencodeLocalAdapter: ServerAdapterModule = {
  type: "opencode_local",
  execute: opencodeExecute,
  testEnvironment: opencodeTestEnvironment,
  sessionCodec: opencodeSessionCodec,
  models: opencodeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: opencodeAgentConfigurationDoc,
};

const cursorLocalAdapter: ServerAdapterModule = {
  type: "cursor",
  execute: cursorExecute,
  testEnvironment: cursorTestEnvironment,
  sessionCodec: cursorSessionCodec,
  models: cursorModels,
  listModels: listCursorModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: cursorAgentConfigurationDoc,
};

const geminiLocalAdapter: ServerAdapterModule = {
  type: "gemini_local",
  execute: geminiExecute,
  testEnvironment: geminiTestEnvironment,
  sessionCodec: geminiSessionCodec,
  models: geminiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: geminiAgentConfigurationDoc,
};

const piLocalAdapter: ServerAdapterModule = {
  type: "pi_local",
  execute: piExecute,
  testEnvironment: piTestEnvironment,
  sessionCodec: piSessionCodec,
  models: piModels,
  listModels: listPiModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: piAgentConfigurationDoc,
};

const adaptersByType = new Map<string, ServerAdapterModule>(
  [claudeLocalAdapter, codexLocalAdapter, opencodeLocalAdapter, cursorLocalAdapter, geminiLocalAdapter, piLocalAdapter, processAdapter, httpAdapter].map((a) => [a.type, a]),
);

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    // Fall back to process adapter for unknown types
    return processAdapter;
  }
  return adapter;
}

export async function listAdapterModels(type: string): Promise<{ id: string; label: string }[]> {
  const adapter = adaptersByType.get(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return Array.from(adaptersByType.values());
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}
