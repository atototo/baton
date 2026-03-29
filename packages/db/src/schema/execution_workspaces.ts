import {
  index,
  integer,
  jsonb,
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
    syncStatus: text("sync_status").notNull().default("idle"),
    syncMethod: text("sync_method").notNull().default("merge"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastPrCheckedAt: timestamp("last_pr_checked_at", { withTimezone: true }),
    lastBaseCommitSha: text("last_base_commit_sha"),
    lastBranchCommitSha: text("last_branch_commit_sha"),
    pullRequestUrl: text("pull_request_url"),
    pullRequestNumber: text("pull_request_number"),
    prOpenedAt: timestamp("pr_opened_at", { withTimezone: true }),
    lastDriftDetectedAt: timestamp("last_drift_detected_at", { withTimezone: true }),
    recoveryStatus: text("recovery_status").notNull().default("idle"),
    recoveryReason: text("recovery_reason"),
    recoveryRequestedAt: timestamp("recovery_requested_at", { withTimezone: true }),
    recoveryStartedAt: timestamp("recovery_started_at", { withTimezone: true }),
    recoveryFinishedAt: timestamp("recovery_finished_at", { withTimezone: true }),
    recoveryAttemptCount: integer("recovery_attempt_count").notNull().default(0),
    lastRecoveryRunId: uuid("last_recovery_run_id"),
    recoveryContext: jsonb("recovery_context").$type<Record<string, unknown> | null>(),
    conflictSummary: jsonb("conflict_summary").$type<Record<string, unknown> | null>(),
    escalationSummary: text("escalation_summary"),
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
