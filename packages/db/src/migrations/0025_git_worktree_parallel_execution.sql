CREATE TABLE "execution_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"owner_issue_id" uuid,
	"project_id" uuid,
	"project_workspace_id" uuid,
	"source_repo_cwd" text NOT NULL,
	"execution_cwd" text NOT NULL,
	"ticket_key" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"provisioned_at" timestamp with time zone,
	"cleaned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD CONSTRAINT "execution_workspaces_project_workspace_id_project_workspaces_id_fk" FOREIGN KEY ("project_workspace_id") REFERENCES "public"."project_workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "execution_workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_execution_workspace_id_execution_workspaces_id_fk" FOREIGN KEY ("execution_workspace_id") REFERENCES "public"."execution_workspaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_owner_issue_idx" ON "execution_workspaces" USING btree ("company_id","owner_issue_id");
--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_status_idx" ON "execution_workspaces" USING btree ("company_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "execution_workspaces_company_workspace_ticket_idx" ON "execution_workspaces" USING btree ("company_id","project_workspace_id","ticket_key");
