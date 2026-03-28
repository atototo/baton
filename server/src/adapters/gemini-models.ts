import type { AdapterModel } from "./types.js";
import { models as geminiFallbackModels } from "@atototo/adapter-gemini-local";

const GEMINI_MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS_TIMEOUT_MS = 5000;
const GEMINI_MODELS_CACHE_TTL_MS = 60_000;

let cached: { keyFingerprint: string; expiresAt: number; models: AdapterModel[] } | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([
    ...models,
    ...geminiFallbackModels,
  ]).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
}

function resolveGeminiApiKey(): string | null {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) return geminiKey;
  const googleKey = process.env.GOOGLE_API_KEY?.trim();
  if (googleKey) return googleKey;
  return null;
}

function formatModelLabel(id: string): string {
  // "gemini-2.5-pro-preview-05-06" → "Gemini 2.5 Pro Preview 05-06"
  return id
    .replace(/^gemini-/, "Gemini ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d) (\d)/g, "$1.$2"); // "2 5" → "2.5"
}

/** Only include models that support generateContent (chat/code) */
function isCodeModel(methods: string[]): boolean {
  return methods.includes("generateContent");
}

async function fetchGeminiModels(apiKey: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(`${GEMINI_MODELS_ENDPOINT}?key=${apiKey}`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { models?: unknown };
    const data = Array.isArray(payload.models) ? payload.models : [];
    const models: AdapterModel[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name : "";
      // name format: "models/gemini-2.5-pro-preview-05-06"
      const id = name.replace(/^models\//, "");
      if (!id || !id.startsWith("gemini-")) continue;

      const methods = Array.isArray(record.supportedGenerationMethods)
        ? (record.supportedGenerationMethods as string[])
        : [];
      if (!isCodeModel(methods)) continue;

      const displayName = typeof record.displayName === "string" ? record.displayName : formatModelLabel(id);
      models.push({ id, label: displayName });
    }
    return dedupeModels(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listGeminiModels(): Promise<AdapterModel[]> {
  const apiKey = resolveGeminiApiKey();
  const fallback = dedupeModels(geminiFallbackModels);
  if (!apiKey) return fallback;

  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (cached && cached.keyFingerprint === keyFingerprint && cached.expiresAt > now) {
    return cached.models;
  }

  const fetched = await fetchGeminiModels(apiKey);
  if (fetched.length > 0) {
    const merged = mergedWithFallback(fetched);
    cached = {
      keyFingerprint,
      expiresAt: now + GEMINI_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (cached && cached.keyFingerprint === keyFingerprint && cached.models.length > 0) {
    return cached.models;
  }

  return fallback;
}
