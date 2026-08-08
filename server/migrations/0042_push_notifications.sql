CREATE TABLE push_subscriptions (
    push_subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT,
    disabled_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX idx_push_subscriptions_user_status
    ON push_subscriptions(user_id, status);

CREATE TABLE notification_events (
    notification_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT NOT NULL UNIQUE,
    notification_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    audience TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_notification_events_created
    ON notification_events(created_at);

CREATE TABLE notification_deliveries (
    notification_delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_event_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    push_subscription_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'skipped', 'failed')),
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (notification_event_id) REFERENCES notification_events(notification_event_id),
    FOREIGN KEY (push_subscription_id) REFERENCES push_subscriptions(push_subscription_id)
);

CREATE INDEX idx_notification_deliveries_event
    ON notification_deliveries(notification_event_id);

CREATE INDEX idx_notification_deliveries_user
    ON notification_deliveries(user_id);
