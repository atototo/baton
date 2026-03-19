import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { projectWorkspaces } from "./project_workspaces.js";

export const executionWorkspaces = pgTable(
  "execution_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    ownerIssueId: uuid("owner_issue_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    projectWorkspaceId: uuid("project_workspace_id").references(() => projectWorkspaces.id, {
      onDelete: "set null",
    }),
    sourceRepoCwd: text("source_repo_cwd").notNull(),
    executionCwd: text("execution_cwd").notNull(),
    ticketKey: text("ticket_key").notNull(),
    branch: text("branch").notNull(),
    baseBranch: text("base_branch").notNull(),
    status: text("status").notNull().default("ready"),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIssueIdx: index("execution_workspaces_company_owner_issue_idx").on(
      table.companyId,
      table.ownerIssueId,
    ),
    statusIdx: index("execution_workspaces_company_status_idx").on(table.companyId, table.status),
    workspaceTicketIdx: uniqueIndex("execution_workspaces_company_workspace_ticket_idx").on(
      table.companyId,
      table.projectWorkspaceId,
      table.ticketKey,
    ),
  }),
);
