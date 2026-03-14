CREATE TABLE IF NOT EXISTS "pbx_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pbx_credential_id" uuid NOT NULL,
	"extension_number" text NOT NULL,
	"email" text,
	"display_name" text,
	"current_group_id" text,
	"current_group_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pbx_extensions" ADD CONSTRAINT "pbx_extensions_pbx_credential_id_pbx_credentials_id_fk" FOREIGN KEY ("pbx_credential_id") REFERENCES "public"."pbx_credentials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pbx_ext_unique" ON "pbx_extensions" USING btree ("pbx_credential_id","extension_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pbx_ext_cred_id" ON "pbx_extensions" USING btree ("pbx_credential_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_tenant_id" ON "users" USING btree ("tenant_id");