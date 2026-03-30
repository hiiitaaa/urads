-- ベンチマーク（競合）アカウント
CREATE TABLE IF NOT EXISTS benchmarks (
    id                TEXT PRIMARY KEY,
    license_id        TEXT NOT NULL REFERENCES licenses(id),
    threads_handle    TEXT NOT NULL,
    threads_user_id   TEXT,
    display_name      TEXT,
    follower_count    INTEGER,
    note              TEXT,
    status            TEXT NOT NULL DEFAULT 'active',
    status_changed_at INTEGER,
    last_scraped_at   INTEGER,
    created_at        INTEGER NOT NULL
);

-- 収集した投稿
CREATE TABLE IF NOT EXISTS scraped_posts (
    id              TEXT PRIMARY KEY,
    benchmark_id    TEXT NOT NULL REFERENCES benchmarks(id),
    threads_post_id TEXT NOT NULL,
    content         TEXT,
    media_urls      TEXT,
    likes           INTEGER DEFAULT 0,
    replies         INTEGER DEFAULT 0,
    reposts         INTEGER DEFAULT 0,
    quotes          INTEGER DEFAULT 0,
    is_buzz         INTEGER DEFAULT 0,
    source          TEXT NOT NULL DEFAULT 'api',
    posted_at       INTEGER,
    scraped_at      INTEGER NOT NULL,
    UNIQUE(benchmark_id, threads_post_id)
);

CREATE INDEX IF NOT EXISTS idx_scraped_buzz ON scraped_posts(is_buzz) WHERE is_buzz = 1;

-- 分析結果
CREATE TABLE IF NOT EXISTS analysis_results (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    type        TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

-- リサーチAPI呼び出しログ（グローバルレートリミット）
CREATE TABLE IF NOT EXISTS research_api_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id  TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    called_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_calls_window ON research_api_calls(license_id, endpoint, called_at);

-- リサーチ設定（ユーザーごと）
CREATE TABLE IF NOT EXISTS research_settings (
    license_id      TEXT PRIMARY KEY,
    buzz_likes      INTEGER NOT NULL DEFAULT 1000,
    buzz_replies    INTEGER NOT NULL DEFAULT 100,
    buzz_reposts    INTEGER NOT NULL DEFAULT 50,
    retention_days  INTEGER NOT NULL DEFAULT 90,
    max_pages       INTEGER NOT NULL DEFAULT 2,
    updated_at      INTEGER NOT NULL
);

-- dev用デフォルト設定
INSERT OR IGNORE INTO research_settings (license_id, buzz_likes, buzz_replies, buzz_reposts, retention_days, max_pages, updated_at)
VALUES ('dev-license', 1000, 100, 50, 90, 2, 0);
