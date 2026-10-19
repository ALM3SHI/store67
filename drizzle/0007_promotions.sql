CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"type" text NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_quantity" integer DEFAULT 2 NOT NULL,
	"percent_off" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
