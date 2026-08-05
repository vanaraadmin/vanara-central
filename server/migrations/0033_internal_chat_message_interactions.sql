ALTER TABLE chat_messages ADD COLUMN reply_to_message_id INTEGER;

ALTER TABLE chat_conversations ADD COLUMN announced_message_id INTEGER;
ALTER TABLE chat_conversations ADD COLUMN announced_by_user_id TEXT;
ALTER TABLE chat_conversations ADD COLUMN announced_at TEXT;

CREATE TABLE IF NOT EXISTS chat_message_reactions (
    message_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL CHECK (emoji IN ('👍', '😂', '😍', '🙏', '👀', '🔥')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    PRIMARY KEY (message_id, user_id),

    FOREIGN KEY (message_id)
        REFERENCES chat_messages(message_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (conversation_id)
        REFERENCES chat_conversations(conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
    ON chat_message_reactions(message_id, emoji);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_conversation
    ON chat_message_reactions(conversation_id, message_id);
