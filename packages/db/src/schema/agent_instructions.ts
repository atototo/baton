import { pgTable, uuid, text, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentInstructions = pgTable(
  "agent_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    isEntryFile: boolean("is_entry_file").notNull().default(false),
    source: text("source").notNull().default("managed"),
    contentHash: text("content_hash"),
    syncedFrom: text("synced_from"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("agent_instructions_agent_idx").on(table.agentId),
    companyIdx: index("agent_instructions_company_idx").on(table.companyId),
    agentPathUnique: unique("agent_instructions_agent_path_uniq").on(table.agentId, table.path),
  }),
);
