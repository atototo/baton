import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const skillFiles = pgTable(
  "skill_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    skillName: text("skill_name").notNull(),       // e.g., "baton"
    path: text("path").notNull(),                   // e.g., "SKILL.md", "references/governance.md"
    content: text("content").notNull(),
    contentHash: text("content_hash"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companySkillPathUnique: unique("skill_files_company_skill_path_uniq").on(table.companyId, table.skillName, table.path),
    companyIdx: index("skill_files_company_idx").on(table.companyId),
  }),
);
