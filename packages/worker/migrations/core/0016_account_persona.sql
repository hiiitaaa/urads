-- バズ自動リライト機能 基盤: アカウント単位の世界観（persona）
-- 設計: docs/buzz_rewrite_design.md §4

CREATE TABLE IF NOT EXISTS account_persona (
    account_id     TEXT PRIMARY KEY REFERENCES accounts(id),
    content        TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    hash           TEXT NOT NULL,
    updated_at     INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
);
