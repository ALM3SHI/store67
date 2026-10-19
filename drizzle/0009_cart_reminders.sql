CREATE TABLE "cart_reminders" (
	"email" text PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"items" jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_reminders" ENABLE ROW LEVEL SECURITY;
