ALTER TABLE notification_events
ADD COLUMN sound_type TEXT NOT NULL DEFAULT 'event' CHECK (sound_type IN ('chat', 'event'));
