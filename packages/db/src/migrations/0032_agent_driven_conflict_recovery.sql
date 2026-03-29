ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_status" text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_reason" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_finished_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "last_recovery_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "execution_workspaces"
ADD COLUMN "recovery_context" jsonb;
