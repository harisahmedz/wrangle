CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS cards_fts_idx ON cards
  USING gin (to_tsvector('english', title || ' ' || coalesce(description, '')))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cards_title_trgm_idx ON cards
  USING gin (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cards_project_due_open_idx ON cards (project_id, due_at)
  WHERE completed_at IS NULL AND deleted_at IS NULL;
