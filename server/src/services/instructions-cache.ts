import { createHash } from "node:crypto";

export interface CachedBundle {
  files: Map<string, string>; // path → content
  entryFile: string;
  hash: string;
  loadedAt: Date;
}

const cache = new Map<string, CachedBundle>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5분

export function instructionsCache(ttlMs: number = DEFAULT_TTL_MS) {
  function get(agentId: string): CachedBundle | null {
    const entry = cache.get(agentId);
    if (!entry) return null;
    if (Date.now() - entry.loadedAt.getTime() > ttlMs) {
      cache.delete(agentId);
      return null;
    }
    return entry;
  }

  function set(agentId: string, bundle: CachedBundle): void {
    cache.set(agentId, bundle);
  }

  function invalidate(agentId: string): void {
    cache.delete(agentId);
  }

  function clear(): void {
    cache.clear();
  }

  function size(): number {
    return cache.size;
  }

  return { get, set, invalidate, clear, size };
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export type InstructionsCache = ReturnType<typeof instructionsCache>;
