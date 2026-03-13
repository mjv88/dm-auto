CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verify_token" text,
	"verify_token_expires_at" timestamp with time zone,
	"reset_token" text,
	"reset_token_expires_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "from_dept_name" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "to_dept_name" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_reset_token" ON "users" USING btree ("reset_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_verify_token" ON "users" USING btree ("verify_token");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runners" ADD CONSTRAINT "runners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
