-- リプライルール
CREATE TABLE IF NOT EXISTS reply_rules (
    id          TEXT PRIMARY KEY,
    post_id     TEXT,
    account_id  TEXT NOT NULL REFERENCES accounts(id),
    type        TEXT NOT NULL,          -- 'keyword_match' | 'random'
    config      TEXT NOT NULL,          -- JSON（triggers, responses等）
    max_replies INTEGER DEFAULT 200,
    reply_count INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1,
    reply_once_per_user INTEGER DEFAULT 1,
    cooldown_seconds INTEGER DEFAULT 5,
    expires_at  INTEGER,
    created_at  INTEGER NOT NULL
);

-- リプライ実行ログ
CREATE TABLE IF NOT EXISTS reply_logs (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES reply_rules(id),
    trigger_user_id TEXT NOT NULL,
    trigger_text    TEXT,
    response_text   TEXT NOT NULL,
    threads_reply_id TEXT,
    replied_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reply_logs_rule ON reply_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_reply_logs_user ON reply_logs(rule_id, trigger_user_id);

-- ルールテンプレート
CREATE TABLE IF NOT EXISTS rule_templates (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    config      TEXT NOT NULL,          -- JSON
    created_at  INTEGER NOT NULL
);
