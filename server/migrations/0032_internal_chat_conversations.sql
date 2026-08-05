ALTER TABLE chat_conversations ADD COLUMN conversation_kind TEXT NOT NULL DEFAULT 'GROUP' CHECK (conversation_kind IN ('GROUP', 'PRIVATE'));
ALTER TABLE chat_conversations ADD COLUMN private_pair_key TEXT;

CREATE TABLE IF NOT EXISTS chat_conversation_participants (
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    last_read_at TEXT,

    PRIMARY KEY (conversation_id, user_id),

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_message_mentions (
    message_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL,
    mentioned_user_id TEXT NOT NULL,
    mentioned_username TEXT NOT NULL,
    created_at TEXT NOT NULL,

    PRIMARY KEY (message_id, mentioned_user_id),

    FOREIGN KEY (message_id)
        REFERENCES chat_messages(message_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_private_pair
    ON chat_conversations(private_pair_key)
    WHERE conversation_kind = 'PRIVATE' AND private_pair_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON chat_conversation_participants(user_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_participants_read
    ON chat_conversation_participants(conversation_id, last_read_message_id);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_user
    ON chat_message_mentions(mentioned_user_id, conversation_id, message_id);

UPDATE chat_conversations
SET conversation_kind = 'GROUP',
    title = 'Vanara Group Chat',
    subtitle = 'Team conversation'
WHERE conversation_id = 'general-operations';

INSERT OR IGNORE INTO chat_conversation_participants (
    conversation_id,
    user_id,
    display_name,
    username,
    role,
    joined_at
)
SELECT
    'general-operations',
    u.user_id,
    u.full_name,
    u.username,
    u.role,
    datetime('now')
FROM users u
WHERE u.status = 'active'
  AND (
    EXISTS (
      SELECT 1
      FROM user_views v
      WHERE v.user_id = u.user_id
        AND v.view_key IN ('staff', 'owner')
    )
    OR EXISTS (
      SELECT 1
      FROM user_module_permissions p
      WHERE p.user_id = u.user_id
        AND p.module_key = 'chat'
        AND p.can_access = 1
    )
  );
