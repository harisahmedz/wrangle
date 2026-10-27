-- Custom SQL migration file, put your code below! --

-- ROADMAP-V2 D1/F1: per-user view preferences (Board/List, group by, sort,
-- show completed), keyed per board (and later "learn") so they sync across
-- devices. Nullable, additive, read-merge-write via lib/actions/settings.ts
-- setViewPref; validated at the edges by lib/validation/prefs.ts.
ALTER TABLE "users" ADD COLUMN "prefs" jsonb;
