CREATE TABLE "agent_instruction_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"before_content" text,
	"after_content" text,
	"changed_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"is_entry_file" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'managed' NOT NULL,
	"content_hash" text,
	"synced_from" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_instructions_agent_path_uniq" UNIQUE("agent_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_instruction_revisions" ADD CONSTRAINT "agent_instruction_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instruction_revisions" ADD CONSTRAINT "agent_instruction_revisions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instructions" ADD CONSTRAINT "agent_instructions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_instructions" ADD CONSTRAINT "agent_instructions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_instruction_revisions_agent_created_idx" ON "agent_instruction_revisions" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_instructions_agent_idx" ON "agent_instructions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_instructions_company_idx" ON "agent_instructions" USING btree ("company_id");