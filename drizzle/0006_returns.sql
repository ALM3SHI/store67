CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"exchange_for" text DEFAULT '' NOT NULL,
	"items" jsonb NOT NULL,
	"staff_message" text DEFAULT '' NOT NULL,
	"restocked" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_requests_order_idx" ON "return_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "return_requests_status_idx" ON "return_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "return_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "orders" SET "delivered_at" = "updated_at" WHERE "status" = 'delivered' AND "delivered_at" IS NULL;
