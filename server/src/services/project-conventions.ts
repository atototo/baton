import { and, eq } from "drizzle-orm";
import type { Db } from "@atototo/db";
import { projectConventions } from "@atototo/db";
import type { ProjectConventions } from "@atototo/shared";

type ConventionRow = typeof projectConventions.$inferSelect;

function toProjectConventions(row: ConventionRow): ProjectConventions {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    conventionsMd: row.conventionsMd,
    backstory: row.backstory,
    compactContext: row.compactContext,
    extraReferences: (row.extraReferences as unknown[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function projectConventionsService(db: Db) {
  return {
    getByProjectId: async (projectId: string): Promise<ProjectConventions | null> => {
      const row = await db
        .select()
        .from(projectConventions)
        .where(eq(projectConventions.projectId, projectId))
        .then((rows) => rows[0] ?? null);
      return row ? toProjectConventions(row) : null;
    },

    upsert: async (
      companyId: string,
      projectId: string,
      data: {
        conventionsMd?: string;
        backstory?: string;
        compactContext?: string | null;
        extraReferences?: unknown[];
      },
    ): Promise<ProjectConventions> => {
      const now = new Date();
      const row = await db
        .insert(projectConventions)
        .values({
          companyId,
          projectId,
          conventionsMd: data.conventionsMd ?? "",
          backstory: data.backstory ?? "",
          compactContext: data.compactContext ?? null,
          extraReferences: data.extraReferences ?? [],
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [projectConventions.companyId, projectConventions.projectId],
          set: {
            ...(data.conventionsMd !== undefined ? { conventionsMd: data.conventionsMd } : {}),
            ...(data.backstory !== undefined ? { backstory: data.backstory } : {}),
            ...(data.compactContext !== undefined ? { compactContext: data.compactContext } : {}),
            ...(data.extraReferences !== undefined ? { extraReferences: data.extraReferences } : {}),
            updatedAt: now,
          },
        })
        .returning()
        .then((rows) => rows[0]);
      return toProjectConventions(row);
    },

    update: async (
      projectId: string,
      data: {
        conventionsMd?: string;
        backstory?: string;
        compactContext?: string | null;
        extraReferences?: unknown[];
      },
    ): Promise<ProjectConventions | null> => {
      const patch: Partial<typeof projectConventions.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (data.conventionsMd !== undefined) patch.conventionsMd = data.conventionsMd;
      if (data.backstory !== undefined) patch.backstory = data.backstory;
      if (data.compactContext !== undefined) patch.compactContext = data.compactContext;
      if (data.extraReferences !== undefined) patch.extraReferences = data.extraReferences;

      const row = await db
        .update(projectConventions)
        .set(patch)
        .where(eq(projectConventions.projectId, projectId))
        .returning()
        .then((rows) => rows[0] ?? null);
      return row ? toProjectConventions(row) : null;
    },

    generateCompactContext: async (projectId: string): Promise<string> => {
      const row = await db
        .select()
        .from(projectConventions)
        .where(eq(projectConventions.projectId, projectId))
        .then((rows) => rows[0] ?? null);
      if (!row) return "";

      // Build a compact summary from conventions and backstory
      const parts: string[] = [];
      if (row.backstory.trim()) {
        parts.push(`[backstory] ${row.backstory.trim()}`);
      }
      if (row.conventionsMd.trim()) {
        parts.push(`[conventions] ${row.conventionsMd.trim()}`);
      }
      const compact = parts.join("\n\n");

      // Persist the generated compact context
      await db
        .update(projectConventions)
        .set({ compactContext: compact, updatedAt: new Date() })
        .where(eq(projectConventions.projectId, projectId));

      return compact;
    },
  };
}
