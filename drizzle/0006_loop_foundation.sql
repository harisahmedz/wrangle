CREATE TABLE "day_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"closed" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "focused_on" date;--> statement-breakpoint
ALTER TABLE "day_reviews" ADD CONSTRAINT "day_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "day_reviews_user_date_uq" ON "day_reviews" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "cards_focused_idx" ON "cards" USING btree ("focused_on");