ALTER TABLE chat_messages ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_kind IN ('TEXT', 'STICKER', 'ATTACHMENT'));
ALTER TABLE chat_messages ADD COLUMN sticker_id TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_object_key TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_file_name TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_content_type TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_byte_size INTEGER;
ALTER TABLE chat_messages ADD COLUMN attachment_expires_at TEXT;
ALTER TABLE chat_messages ADD COLUMN attachment_unavailable_at TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment_expiry
    ON chat_messages(attachment_expires_at, attachment_unavailable_at)
    WHERE attachment_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment_object
    ON chat_messages(attachment_object_key)
    WHERE attachment_object_key IS NOT NULL;
