CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_alerts_once_idx" ON "stock_alerts" USING btree ("variant_id","email");--> statement-breakpoint
ALTER TABLE "stock_alerts" ENABLE ROW LEVEL SECURITY;
