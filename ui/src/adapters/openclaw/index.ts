import type { UIAdapterModule } from "../types";
import { parseOpenClawStdoutLine } from "@atototo/adapter-openclaw/ui";
import { buildOpenClawConfig } from "@atototo/adapter-openclaw/ui";
import { OpenClawConfigFields } from "./config-fields";

export const openClawUIAdapter: UIAdapterModule = {
  type: "openclaw",
  label: "OpenClaw",
  parseStdoutLine: parseOpenClawStdoutLine,
  ConfigFields: OpenClawConfigFields,
  buildAdapterConfig: buildOpenClawConfig,
};
