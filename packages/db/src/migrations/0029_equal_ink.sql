CREATE TABLE "skill_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_files_company_skill_path_uniq" UNIQUE("company_id","skill_name","path")
);
--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "prompt_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_files_company_idx" ON "skill_files" USING btree ("company_id");