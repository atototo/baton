import fs from "node:fs";
import { batonConfigSchema, type BatonConfig } from "@atototo/shared";
import { resolveBatonConfigPath } from "./paths.js";

export function readConfigFile(): BatonConfig | null {
  const configPath = resolveBatonConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return batonConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
