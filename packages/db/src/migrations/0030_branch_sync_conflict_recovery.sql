ALTER TABLE "execution_workspaces" ADD COLUMN "sync_status" text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "sync_method" text DEFAULT 'merge' NOT NULL;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_pr_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_base_commit_sha" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_branch_commit_sha" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "conflict_summary" jsonb;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "escalation_summary" text;
