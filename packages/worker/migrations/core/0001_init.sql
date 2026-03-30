-- ライセンス
CREATE TABLE IF NOT EXISTS licenses (
    id              TEXT PRIMARY KEY,
    key             TEXT UNIQUE NOT NULL,
    stripe_customer TEXT NOT NULL,
    plan            TEXT DEFAULT 'standard',
    max_accounts    INTEGER DEFAULT 5,
    activated_at    INTEGER,
    expires_at      INTEGER,
    status          TEXT DEFAULT 'active',
    created_at      INTEGER NOT NULL
);

-- アプリ利用者
CREATE TABLE IF NOT EXISTS app_users (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL REFERENCES licenses(id),
    device_id       TEXT,
    created_at      INTEGER NOT NULL,
    last_seen_at    INTEGER
);

-- Threadsアカウント
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL REFERENCES licenses(id),
    threads_user_id TEXT NOT NULL,
    threads_handle  TEXT NOT NULL,
    display_name    TEXT,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT,
    token_expires_at INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- アカウントUI状態
CREATE TABLE IF NOT EXISTS account_states (
    id          TEXT PRIMARY KEY,
    account_id  TEXT UNIQUE NOT NULL REFERENCES accounts(id),
    ui_state    TEXT NOT NULL,
    saved_at    INTEGER NOT NULL
);

-- 投稿
CREATE TABLE IF NOT EXISTS posts (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL REFERENCES accounts(id),
    content      TEXT NOT NULL,
    media_type   TEXT,
    media_urls   TEXT,
    status       TEXT NOT NULL DEFAULT 'draft',
    threads_id   TEXT,
    error        TEXT,
    scheduled_at INTEGER,
    posted_at    INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_account ON posts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(status, scheduled_at)
    WHERE status = 'scheduled';

-- 開発用ライセンス（本番では Stripe Webhook 経由で作成される）
INSERT OR IGNORE INTO licenses (id, key, stripe_customer, plan, max_accounts, status, created_at)
VALUES ('dev-license', 'dev-key', 'dev-customer', 'standard', 5, 'active', 1711234567000);
