CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pbx_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pbx_fqdn" text NOT NULL,
	"pbx_name" text NOT NULL,
	"auth_mode" text NOT NULL,
	"xapi_client_id" text,
	"xapi_secret" text,
	"xapi_token" text,
	"xapi_token_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pbx_credentials_pbx_fqdn_unique" UNIQUE("pbx_fqdn")
);
--> statement-breakpoint
CREATE TABLE "pbx_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pbx_credential_id" uuid NOT NULL,
	"extension_number" text NOT NULL,
	"display_name" text,
	"email" text,
	"pbx_user_id" integer,
	"prov_link_external" text,
	"prov_link_fetched_at" timestamp with time zone,
	"provisioning_status" text DEFAULT 'pending' NOT NULL,
	"provisioning_error" text,
	"is_selected" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"admin_emails" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
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
	"role" text DEFAULT 'runner' NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "pbx_credentials" ADD CONSTRAINT "pbx_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pbx_extensions" ADD CONSTRAINT "pbx_extensions_pbx_credential_id_pbx_credentials_id_fk" FOREIGN KEY ("pbx_credential_id") REFERENCES "public"."pbx_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_pbx_credentials_tenant_id" ON "pbx_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pbx_ext_unique" ON "pbx_extensions" USING btree ("pbx_credential_id","extension_number");--> statement-breakpoint
CREATE INDEX "idx_pbx_ext_cred_id" ON "pbx_extensions" USING btree ("pbx_credential_id");--> statement-breakpoint
CREATE INDEX "idx_pbx_ext_email" ON "pbx_extensions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_reset_token" ON "users" USING btree ("reset_token");--> statement-breakpoint
CREATE INDEX "idx_users_verify_token" ON "users" USING btree ("verify_token");--> statement-breakpoint
CREATE INDEX "idx_users_tenant_id" ON "users" USING btree ("tenant_id");