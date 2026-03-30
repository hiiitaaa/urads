-- リプライログにThreads reply IDカラム追加（重複排除用）
ALTER TABLE reply_logs ADD COLUMN trigger_reply_id TEXT;

CREATE INDEX IF NOT EXISTS idx_reply_logs_reply_id ON reply_logs(trigger_reply_id);
