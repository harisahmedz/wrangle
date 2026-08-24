UPDATE columns SET is_done = true WHERE name IN ('Done') AND deleted_at IS NULL;
