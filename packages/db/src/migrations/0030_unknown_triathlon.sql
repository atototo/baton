CREATE TABLE "issue_workflow_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"issue_workflow_epoch" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"fingerprint" text NOT NULL,
	"approval_id" uuid,
	"request_run_id" uuid,
	"requested_by_agent_id" uuid,
	"requested_by_user_id" text,
	"superseded_by_session_id" uuid,
	"reopen_signal" text,
	"git_side_effect_state" text DEFAULT 'none' NOT NULL,
	"commit_sha" text,
	"pull_request_number" text,
	"pull_request_url" text,
	"branch" text,
	"base_branch" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"obsoleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "workflow_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "active_workflow_session_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "workflow_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_workflow_sessions" ADD CONSTRAINT "issue_workflow_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_workflow_sessions" ADD CONSTRAINT "issue_workflow_sessions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_workflow_sessions" ADD CONSTRAINT "issue_workflow_sessions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_workflow_sessions" ADD CONSTRAINT "issue_workflow_sessions_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_workflow_sessions_issue_epoch_idx" ON "issue_workflow_sessions" USING btree ("issue_id","issue_workflow_epoch");--> statement-breakpoint
CREATE INDEX "issue_workflow_sessions_issue_status_idx" ON "issue_workflow_sessions" USING btree ("issue_id","status");--> statement-breakpoint
CREATE INDEX "issue_workflow_sessions_requester_status_idx" ON "issue_workflow_sessions" USING btree ("company_id","requested_by_agent_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_workflow_sessions_issue_epoch_kind_fingerprint_idx" ON "issue_workflow_sessions" USING btree ("issue_id","issue_workflow_epoch","kind","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_workflow_sessions_approval_idx" ON "issue_workflow_sessions" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "issues_company_workflow_epoch_idx" ON "issues" USING btree ("company_id","workflow_epoch");
