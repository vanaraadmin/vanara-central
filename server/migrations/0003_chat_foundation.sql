-- Chat foundation for Vanara operational memory.
-- Conversations and messages are persistent D1 records; authentication will replace the temporary current-user resolver later.

CREATE TABLE chat_conversations (
    conversation_id TEXT PRIMARY KEY,
    context_type TEXT NOT NULL CHECK (context_type IN ('general', 'room', 'maintenance', 'housekeeping', 'movement')),
    context_id TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT,
    participant_count INTEGER NOT NULL DEFAULT 1 CHECK (participant_count >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_display_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    body_language TEXT NOT NULL DEFAULT 'en' CHECK (body_language IN ('en', 'th')),
    translated_body TEXT,
    translated_language TEXT CHECK (translated_language IS NULL OR translated_language IN ('en', 'th')),
    created_at TEXT NOT NULL,

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_chat_messages_conversation_created
    ON chat_messages(conversation_id, created_at, message_id);

CREATE INDEX idx_chat_conversations_updated
    ON chat_conversations(updated_at);

INSERT INTO chat_conversations (
    conversation_id,
    context_type,
    context_id,
    title,
    subtitle,
    status,
    priority,
    participant_count,
    created_at,
    updated_at
) VALUES (
    'general-operations',
    'general',
    NULL,
    'General Operations',
    'Resort operational memory',
    'open',
    'normal',
    1,
    datetime('now'),
    datetime('now')
)
ON CONFLICT(conversation_id) DO NOTHING;
