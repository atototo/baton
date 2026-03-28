import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentInstructionRevisions = pgTable(
  "agent_instruction_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    beforeContent: text("before_content"),
    afterContent: text("after_content"),
    changedBy: text("changed_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentCreatedIdx: index("agent_instruction_revisions_agent_created_idx").on(
      table.agentId,
      table.createdAt,
    ),
  }),
);
