-- 投稿エンゲージメント（時系列スナップショット）
CREATE TABLE IF NOT EXISTS post_insights (
    id              TEXT PRIMARY KEY,
    account_id      TEXT NOT NULL,
    threads_id      TEXT NOT NULL,
    content_preview TEXT,
    likes           INTEGER DEFAULT 0,
    replies         INTEGER DEFAULT 0,
    reposts         INTEGER DEFAULT 0,
    quotes          INTEGER DEFAULT 0,
    fetched_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insights_account ON post_insights(account_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_threads ON post_insights(threads_id, fetched_at DESC);
