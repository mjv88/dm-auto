CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runner_id" uuid NOT NULL,
	"entra_email" text NOT NULL,
	"pbx_fqdn" text NOT NULL,
	"extension_number" text NOT NULL,
	"from_dept_id" text,
	"to_dept_id" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"device_id" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dept_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pbx_credential_id" uuid NOT NULL,
	"dept_id" text NOT NULL,
	"dept_name" text NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pbx_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pbx_fqdn" text NOT NULL,
	"pbx_name" text NOT NULL,
	"auth_mode" text NOT NULL,
	"xapi_client_id" text,
	"xapi_secret" text,
	"pbx_username" text,
	"pbx_password" text,
	"xapi_token" text,
	"xapi_token_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pbx_credentials_pbx_fqdn_unique" UNIQUE("pbx_fqdn")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pbx_credential_id" uuid NOT NULL,
	"entra_email" text NOT NULL,
	"extension_number" text NOT NULL,
	"allowed_dept_ids" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"entra_group_id" text NOT NULL,
	"admin_emails" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_entra_tenant_id_unique" UNIQUE("entra_tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dept_cache" ADD CONSTRAINT "dept_cache_pbx_credential_id_pbx_credentials_id_fk" FOREIGN KEY ("pbx_credential_id") REFERENCES "public"."pbx_credentials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pbx_credentials" ADD CONSTRAINT "pbx_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runners" ADD CONSTRAINT "runners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runners" ADD CONSTRAINT "runners_pbx_credential_id_pbx_credentials_id_fk" FOREIGN KEY ("pbx_credential_id") REFERENCES "public"."pbx_credentials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_runner_id" ON "audit_log" USING btree ("runner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_entra_email" ON "audit_log" USING btree ("entra_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_pbx_fqdn" ON "audit_log" USING btree ("pbx_fqdn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dept_cache_cred_dept_unique" ON "dept_cache" USING btree ("pbx_credential_id","dept_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dept_cache_pbx_credential_id" ON "dept_cache" USING btree ("pbx_credential_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pbx_credentials_tenant_id" ON "pbx_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pbx_credentials_pbx_fqdn" ON "pbx_credentials" USING btree ("pbx_fqdn");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_runners_email_cred_unique" ON "runners" USING btree ("entra_email","pbx_credential_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_runners_tenant_id" ON "runners" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_runners_entra_email" ON "runners" USING btree ("entra_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_runners_pbx_credential_id" ON "runners" USING btree ("pbx_credential_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_runners_is_active" ON "runners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_entra_tenant_id" ON "tenants" USING btree ("entra_tenant_id");