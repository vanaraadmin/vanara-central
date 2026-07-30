-- Reception completion actions are privileged operational events.
-- The permission is separate from module access/edit so users may view Check-In / Out
-- without being able to complete irreversible check-in/check-out events.

CREATE TABLE user_action_permissions (
    user_id TEXT NOT NULL,
    action_key TEXT NOT NULL CHECK (action_key IN ('can_complete_checkin_checkout')),
    allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, action_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_user_action_permissions_action
    ON user_action_permissions(action_key, allowed);

INSERT INTO user_action_permissions (user_id, action_key, allowed)
SELECT user_id, 'can_complete_checkin_checkout', 1
FROM users
WHERE role IN ('Owner', 'Manager');
