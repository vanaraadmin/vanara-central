CREATE TABLE IF NOT EXISTS message_conversations (
    message_conversation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL CHECK (provider IN ('BEDS24')),
    provider_conversation_id TEXT NOT NULL,
    booking_id INTEGER,
    beds24_booking_id INTEGER,
    channel TEXT NOT NULL DEFAULT 'UNKNOWN',
    state TEXT NOT NULL DEFAULT 'OPEN',
    last_message_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (provider, provider_conversation_id),

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
    message_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_conversation_id INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('BEDS24')),
    provider_message_id TEXT NOT NULL,
    provider_booking_id INTEGER,
    booking_id INTEGER,
    beds24_booking_id INTEGER,
    direction TEXT NOT NULL DEFAULT 'INBOUND' CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    author TEXT NOT NULL DEFAULT 'GUEST' CHECK (author IN ('GUEST', 'WARAPORN', 'STAFF', 'PROVIDER')),
    received_at TEXT NOT NULL,
    guest_message TEXT NOT NULL,
    language TEXT,
    channel TEXT NOT NULL DEFAULT 'UNKNOWN',
    state TEXT NOT NULL DEFAULT 'RECEIVED',
    association_state TEXT NOT NULL CHECK (association_state IN ('LINKED', 'UNLINKED')),
    raw_provider_payload TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (provider, provider_message_id),
    UNIQUE (idempotency_key),

    FOREIGN KEY (message_conversation_id)
        REFERENCES message_conversations(message_conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_received_at
    ON messages(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_booking_id
    ON messages(booking_id);

CREATE INDEX IF NOT EXISTS idx_messages_provider_booking_id
    ON messages(provider, provider_booking_id);

CREATE INDEX IF NOT EXISTS idx_messages_association_state
    ON messages(association_state, received_at DESC);
