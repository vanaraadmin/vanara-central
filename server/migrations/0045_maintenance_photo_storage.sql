ALTER TABLE maintenance_ticket_photos ADD COLUMN object_key TEXT;
ALTER TABLE maintenance_ticket_photos ADD COLUMN content_type TEXT;
ALTER TABLE maintenance_ticket_photos ADD COLUMN file_name TEXT;
ALTER TABLE maintenance_ticket_photos ADD COLUMN byte_size INTEGER;
