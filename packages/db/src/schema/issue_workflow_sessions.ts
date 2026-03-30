import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, integer } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { approvals } from "./approvals.js";
import { agents } from "./agents.js";

export const issueWorkflowSessions = pgTable(
  "issue_workflow_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    issueWorkflowEpoch: integer("issue_workflow_epoch").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("open"),
    fingerprint: text("fingerprint").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    requestRunId: uuid("request_run_id"),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    requestedByUserId: text("requested_by_user_id"),
    supersededBySessionId: uuid("superseded_by_session_id"),
    reopenSignal: text("reopen_signal"),
    gitSideEffectState: text("git_side_effect_state").notNull().default("none"),
    commitSha: text("commit_sha"),
    pullRequestNumber: text("pull_request_number"),
    pullRequestUrl: text("pull_request_url"),
    branch: text("branch"),
    baseBranch: text("base_branch"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    obsoletedAt: timestamp("obsoleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueEpochIdx: index("issue_workflow_sessions_issue_epoch_idx").on(table.issueId, table.issueWorkflowEpoch),
    issueStatusIdx: index("issue_workflow_sessions_issue_status_idx").on(table.issueId, table.status),
    requesterStatusIdx: index("issue_workflow_sessions_requester_status_idx").on(
      table.companyId,
      table.requestedByAgentId,
      table.status,
    ),
    fingerprintIdx: uniqueIndex("issue_workflow_sessions_issue_epoch_kind_fingerprint_idx").on(
      table.issueId,
      table.issueWorkflowEpoch,
      table.kind,
      table.fingerprint,
    ),
    approvalIdx: uniqueIndex("issue_workflow_sessions_approval_idx").on(table.approvalId),
  }),
);
