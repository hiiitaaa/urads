-- 既存のグローバルルール（post_id=NULL）を削除
DELETE FROM reply_logs WHERE rule_id IN (SELECT id FROM reply_rules WHERE post_id IS NULL);
DELETE FROM reply_rules WHERE post_id IS NULL;

-- reply_rules: post_id → threads_post_id にリネーム + NOT NULL化
-- SQLiteはALTER TABLE RENAMEカラム非対応なのでテーブル再作成
CREATE TABLE reply_rules_new (
    id                  TEXT PRIMARY KEY,
    threads_post_id     TEXT NOT NULL,
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    type                TEXT NOT NULL,
    config              TEXT NOT NULL,
    max_replies         INTEGER DEFAULT 200,
    reply_count         INTEGER DEFAULT 0,
    active              INTEGER DEFAULT 1,
    reply_once_per_user INTEGER DEFAULT 1,
    cooldown_seconds    INTEGER DEFAULT 5,
    expires_at          INTEGER,
    created_at          INTEGER NOT NULL
);

INSERT INTO reply_rules_new SELECT id, post_id, account_id, type, config, max_replies, reply_count, active, reply_once_per_user, cooldown_seconds, expires_at, created_at FROM reply_rules WHERE post_id IS NOT NULL;
DROP TABLE reply_rules;
ALTER TABLE reply_rules_new RENAME TO reply_rules;

-- reply_logs に account_id 追加（効率的なカウント用）
ALTER TABLE reply_logs ADD COLUMN account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reply_logs_account ON reply_logs(account_id, replied_at);
