-- 投稿テンプレート
CREATE TABLE IF NOT EXISTS post_templates (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL,
    name            TEXT NOT NULL,
    content         TEXT NOT NULL,
    variables       TEXT,           -- JSON: ["商品名","価格"]
    category        TEXT,
    usage_count     INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_license ON post_templates(license_id, usage_count DESC);
