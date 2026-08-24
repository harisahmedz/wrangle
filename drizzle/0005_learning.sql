CREATE TYPE "public"."learning_status" AS ENUM('want', 'learning', 'learned');--> statement-breakpoint
CREATE TYPE "public"."learning_type" AS ENUM('course', 'book', 'video', 'article', 'skill', 'other');--> statement-breakpoint
CREATE TABLE "card_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "learning_type" DEFAULT 'other' NOT NULL,
	"status" "learning_status" DEFAULT 'want' NOT NULL,
	"source_url" text,
	"why_note" text,
	"target_date" date,
	"progress_pct" smallint DEFAULT 0 NOT NULL,
	"hours_logged" numeric(6, 2) DEFAULT '0' NOT NULL,
	"completed_at" timestamp with time zone,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"happened_on" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_links" ADD CONSTRAINT "card_links_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_links" ADD CONSTRAINT "card_links_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_milestones" ADD CONSTRAINT "learning_milestones_item_id_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_notes" ADD CONSTRAINT "learning_notes_item_id_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_resources" ADD CONSTRAINT "learning_resources_item_id_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_item_id_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_links_uq" ON "card_links" USING btree ("card_id","learning_item_id");--> statement-breakpoint
CREATE INDEX "learning_items_user_status_idx" ON "learning_items" USING btree ("user_id","status","position");--> statement-breakpoint
CREATE INDEX "learning_milestones_item_idx" ON "learning_milestones" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "learning_notes_item_idx" ON "learning_notes" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_resources_item_idx" ON "learning_resources" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_item_idx" ON "learning_sessions" USING btree ("item_id","happened_on");