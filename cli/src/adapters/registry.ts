import type { CLIAdapterModule } from "@atototo/adapter-utils";
import { printClaudeStreamEvent } from "@atototo/adapter-claude-local/cli";
import { printCodexStreamEvent } from "@atototo/adapter-codex-local/cli";
import { printCursorStreamEvent } from "@atototo/adapter-cursor-local/cli";
import { printOpenCodeStreamEvent } from "@atototo/adapter-opencode-local/cli";
import { printOpenClawStreamEvent } from "@atototo/adapter-openclaw/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const claudeLocalCLIAdapter: CLIAdapterModule = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent,
};

const codexLocalCLIAdapter: CLIAdapterModule = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent,
};

const opencodeLocalCLIAdapter: CLIAdapterModule = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent,
};

const cursorLocalCLIAdapter: CLIAdapterModule = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent,
};

const openclawCLIAdapter: CLIAdapterModule = {
  type: "openclaw",
  formatStdoutEvent: printOpenClawStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [claudeLocalCLIAdapter, codexLocalCLIAdapter, opencodeLocalCLIAdapter, cursorLocalCLIAdapter, openclawCLIAdapter, processCLIAdapter, httpCLIAdapter].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? processCLIAdapter;
}
