CREATE TABLE free_text_translations (
    translation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    source_text_hash TEXT NOT NULL,
    source_language TEXT,
    target_language TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'google_cloud_translation',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (entity_type, entity_id, field_name, source_text_hash, target_language)
);

CREATE INDEX idx_free_text_translations_entity
    ON free_text_translations(entity_type, entity_id, field_name);

CREATE INDEX idx_free_text_translations_target
    ON free_text_translations(target_language, updated_at);
