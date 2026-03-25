CREATE TABLE "project_conventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conventions_md" text DEFAULT '' NOT NULL,
	"backstory" text DEFAULT '' NOT NULL,
	"compact_context" text,
	"extra_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_conventions_company_project_uniq" UNIQUE("company_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "project_conventions" ADD CONSTRAINT "project_conventions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_conventions" ADD CONSTRAINT "project_conventions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_conventions_project_idx" ON "project_conventions" USING btree ("project_id");