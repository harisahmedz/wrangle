-- Custom SQL migration file, put your code below! --

-- ROADMAP-V2 S9/B85 (D3): card priority. Nullable, additive. Storage
-- convention (see lib/kanban/priority.ts, architecture-and-data.md §5):
-- the app only ever writes 1|2|3|null — "P4" (no priority, Todoist's
-- default/no-flag tier) is represented as NULL, never the literal 4. The
-- CHECK still allows the full 1–4 range for forward compatibility.
ALTER TABLE "cards" ADD COLUMN "priority" smallint;
ALTER TABLE "cards" ADD CONSTRAINT "cards_priority_check" CHECK ("priority" IS NULL OR "priority" BETWEEN 1 AND 4);