-- Enforce the denormalized card ancestry, not just each parent independently.
UPDATE cards AS c
SET board_id = col.board_id
FROM columns AS col
WHERE c.column_id = col.id AND c.board_id <> col.board_id;

UPDATE cards AS c
SET project_id = b.project_id
FROM boards AS b
WHERE c.board_id = b.id AND c.project_id <> b.project_id;

CREATE UNIQUE INDEX boards_id_project_uq ON boards (id, project_id);
CREATE UNIQUE INDEX columns_id_board_uq ON columns (id, board_id);

ALTER TABLE cards
  ADD CONSTRAINT cards_column_board_fk
  FOREIGN KEY (column_id, board_id)
  REFERENCES columns(id, board_id) ON DELETE CASCADE;

ALTER TABLE cards
  ADD CONSTRAINT cards_board_project_fk
  FOREIGN KEY (board_id, project_id)
  REFERENCES boards(id, project_id) ON DELETE CASCADE;

ALTER TABLE cards DROP CONSTRAINT cards_board_id_boards_id_fk;
ALTER TABLE cards DROP CONSTRAINT cards_project_id_projects_id_fk;
