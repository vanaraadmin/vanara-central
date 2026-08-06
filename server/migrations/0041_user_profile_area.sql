ALTER TABLE users ADD COLUMN display_name TEXT;

UPDATE users
SET display_name = COALESCE(NULLIF(TRIM(username), ''), full_name)
WHERE display_name IS NULL OR TRIM(display_name) = '';
