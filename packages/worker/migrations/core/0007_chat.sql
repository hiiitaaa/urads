-- チャットツール実行ログ（監査用）
CREATE TABLE IF NOT EXISTS chat_tool_executions (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL,
    tool_name   TEXT NOT NULL,
    tool_input  TEXT,
    tool_result TEXT,
    confirmed   INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_log ON chat_tool_executions(license_id, created_at DESC);

-- アシスタント名
ALTER TABLE ai_settings ADD COLUMN assistant_name TEXT DEFAULT 'Navi';
