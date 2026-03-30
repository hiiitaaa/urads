-- トレンド投稿（スクレイプで取得）
CREATE TABLE IF NOT EXISTS trending_posts (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL,
    username    TEXT NOT NULL,
    content     TEXT,
    likes       INTEGER DEFAULT 0,
    replies     INTEGER DEFAULT 0,
    reposts     INTEGER DEFAULT 0,
    score       INTEGER DEFAULT 0,
    scraped_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trending_score ON trending_posts(license_id, scraped_at DESC);
