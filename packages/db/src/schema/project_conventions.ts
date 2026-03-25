import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const projectConventions = pgTable(
  "project_conventions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    conventionsMd: text("conventions_md").notNull().default(""),
    backstory: text("backstory").notNull().default(""),
    compactContext: text("compact_context"),
    extraReferences: jsonb("extra_references").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectUniq: unique("project_conventions_company_project_uniq").on(table.companyId, table.projectId),
    projectIdx: index("project_conventions_project_idx").on(table.projectId),
  }),
);
