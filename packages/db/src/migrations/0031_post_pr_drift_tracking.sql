ALTER TABLE "execution_workspaces" ADD COLUMN "pull_request_url" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "pull_request_number" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "pr_opened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "last_drift_detected_at" timestamp with time zone;
