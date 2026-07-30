-- Sprint 07: production authentication, sessions, views and module permissions.
-- Users are owner-managed only. No public registration is supported.

CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    profile_photo_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Reception', 'Housekeeping', 'Maintenance', 'Operations')),
    preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'th')),
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE user_views (
    user_id TEXT NOT NULL,
    view_key TEXT NOT NULL CHECK (view_key IN ('owner', 'staff')),

    PRIMARY KEY (user_id, view_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE user_module_permissions (
    user_id TEXT NOT NULL,
    module_key TEXT NOT NULL CHECK (module_key IN (
        'dashboard',
        'rooms',
        'housekeeping',
        'movements',
        'maintenance',
        'procurement',
        'chat',
        'owner-dashboard',
        'settings'
    )),
    can_access INTEGER NOT NULL DEFAULT 0 CHECK (can_access IN (0, 1)),
    can_edit INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1)),

    PRIMARY KEY (user_id, module_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_users_status
    ON users(status);

CREATE INDEX idx_user_sessions_user
    ON user_sessions(user_id);

CREATE INDEX idx_user_sessions_expires
    ON user_sessions(expires_at);
