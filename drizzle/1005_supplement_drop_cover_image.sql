-- Drop the never-used card image cover field (UI-UX §9 P2 cleanup).
ALTER TABLE cards DROP COLUMN IF EXISTS cover_image_public_id;
