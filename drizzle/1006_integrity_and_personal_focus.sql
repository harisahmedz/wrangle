-- Repair denormalized card ownership before enforcing the declared references.
UPDATE cards AS c
SET board_id = col.board_id
FROM columns AS col
WHERE c.column_id = col.id AND c.board_id <> col.board_id;

UPDATE cards AS c
SET project_id = b.project_id
FROM boards AS b
WHERE c.board_id = b.id AND c.project_id <> b.project_id;

ALTER TABLE cards
  ADD CONSTRAINT cards_board_id_boards_id_fk
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;

ALTER TABLE cards
  ADD CONSTRAINT cards_project_id_projects_id_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE cards ADD COLUMN completed_by uuid;
ALTER TABLE cards
  ADD CONSTRAINT cards_completed_by_users_id_fk
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;

-- Attribute existing completions when a matching activity record exists.
UPDATE cards AS c
SET completed_by = (
  SELECT a.actor_id
  FROM activities AS a
  WHERE a.entity_type = 'card'
    AND a.entity_id = c.id
    AND a.verb = 'completed'
    AND a.actor_id IS NOT NULL
  ORDER BY a.created_at DESC
  LIMIT 1
)
WHERE c.completed_at IS NOT NULL;

ALTER TABLE memberships ADD COLUMN position text;
UPDATE memberships AS m
SET position = p.position
FROM projects AS p
WHERE m.project_id = p.id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, position ORDER BY joined_at, id
  ) AS n
  FROM memberships
)
UPDATE memberships AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

ALTER TABLE memberships ALTER COLUMN position SET DEFAULT 'a0';
ALTER TABLE memberships ALTER COLUMN position SET NOT NULL;
CREATE UNIQUE INDEX memberships_user_position_uq
  ON memberships (user_id, position);

CREATE TABLE card_focuses (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  focus_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX card_focuses_user_date_idx
  ON card_focuses (user_id, focus_date);

ALTER TABLE attachments ADD COLUMN deleted_at timestamptz;
ALTER TABLE labels ADD COLUMN deleted_at timestamptz;
ALTER TABLE checklist_items ADD COLUMN deleted_at timestamptz;
ALTER TABLE learning_milestones ADD COLUMN deleted_at timestamptz;
ALTER TABLE learning_sessions ADD COLUMN deleted_at timestamptz;
ALTER TABLE learning_resources ADD COLUMN deleted_at timestamptz;
ALTER TABLE learning_notes ADD COLUMN deleted_at timestamptz;

-- Old append queries could reuse the first key. Preserve one row at the old key
-- and give later duplicates valid fractional suffixes before adding uniqueness.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY board_id, position ORDER BY created_at, id
  ) AS n
  FROM columns
  WHERE deleted_at IS NULL
)
UPDATE columns AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY column_id, position ORDER BY created_at, id
  ) AS n
  FROM cards
  WHERE deleted_at IS NULL
)
UPDATE cards AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY card_id, position ORDER BY id
  ) AS n
  FROM checklist_items
  WHERE deleted_at IS NULL
)
UPDATE checklist_items AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, position ORDER BY id
  ) AS n
  FROM expense_categories
)
UPDATE expense_categories AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, status, position ORDER BY created_at, id
  ) AS n
  FROM learning_items
  WHERE deleted_at IS NULL
)
UPDATE learning_items AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY item_id, position ORDER BY id
  ) AS n
  FROM learning_milestones
  WHERE deleted_at IS NULL
)
UPDATE learning_milestones AS item
SET position = item.position || 'V' || replace(item.id::text, '-', '') || 'V'
FROM ranked
WHERE item.id = ranked.id AND ranked.n > 1;

DROP INDEX IF EXISTS columns_board_position_idx;
DROP INDEX IF EXISTS cards_column_position_idx;
DROP INDEX IF EXISTS checklist_card_position_idx;
DROP INDEX IF EXISTS expense_categories_user_idx;
DROP INDEX IF EXISTS learning_items_user_status_idx;
DROP INDEX IF EXISTS learning_milestones_item_idx;

CREATE UNIQUE INDEX columns_board_position_uq
  ON columns (board_id, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX cards_column_position_uq
  ON cards (column_id, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX checklist_card_position_uq
  ON checklist_items (card_id, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX expense_categories_user_position_uq
  ON expense_categories (user_id, position);
CREATE UNIQUE INDEX learning_items_user_status_position_uq
  ON learning_items (user_id, status, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX learning_milestones_item_position_uq
  ON learning_milestones (item_id, position) WHERE deleted_at IS NULL;
