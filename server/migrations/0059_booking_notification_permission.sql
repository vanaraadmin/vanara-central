-- Booking notification recipients extend the existing action-permission model.
-- No user is granted the capability by this migration; missing rows are false.

PRAGMA foreign_keys = OFF;

ALTER TABLE user_action_permissions RENAME TO user_action_permissions_legacy_0059;

CREATE TABLE user_action_permissions (
    user_id TEXT NOT NULL,
    action_key TEXT NOT NULL CHECK (action_key IN (
        'can_complete_checkin_checkout',
        'can_receive_booking_notifications'
    )),
    allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, action_key),

    FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

INSERT INTO user_action_permissions (
    user_id,
    action_key,
    allowed,
    created_at,
    updated_at
)
SELECT
    user_id,
    action_key,
    allowed,
    created_at,
    updated_at
FROM user_action_permissions_legacy_0059;

DROP TABLE user_action_permissions_legacy_0059;

CREATE INDEX idx_user_action_permissions_action
    ON user_action_permissions(action_key, allowed);

PRAGMA foreign_keys = ON;
