import { z } from "zod";

export const upsertProjectConventionsSchema = z.object({
  conventionsMd: z.string().optional(),
  backstory: z.string().optional(),
  compactContext: z.string().nullable().optional(),
  extraReferences: z.array(z.unknown()).optional(),
});

export type UpsertProjectConventions = z.infer<typeof upsertProjectConventionsSchema>;

export const updateProjectConventionsSchema = z.object({
  conventionsMd: z.string().optional(),
  backstory: z.string().optional(),
  compactContext: z.string().nullable().optional(),
  extraReferences: z.array(z.unknown()).optional(),
}).partial();

export type UpdateProjectConventions = z.infer<typeof updateProjectConventionsSchema>;
