-- AI設定（ライセンス単位）
CREATE TABLE IF NOT EXISTS ai_settings (
    license_id      TEXT PRIMARY KEY REFERENCES licenses(id),
    ai_provider     TEXT NOT NULL DEFAULT 'claude',
    claude_api_key  TEXT,
    claude_model    TEXT DEFAULT 'claude-haiku-4-5-20251001',
    ollama_model    TEXT DEFAULT 'llama3',
    max_tokens      INTEGER DEFAULT 300,
    key_source      TEXT NOT NULL DEFAULT 'own',
    retention_days  INTEGER NOT NULL DEFAULT 30,
    updated_at      INTEGER NOT NULL
);

-- AIプリセット
CREATE TABLE IF NOT EXISTS ai_presets (
    id              TEXT PRIMARY KEY,
    license_id      TEXT,
    name            TEXT NOT NULL,
    description     TEXT,
    prompt_template TEXT NOT NULL,
    variables       TEXT NOT NULL,
    is_builtin      INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL
);

-- 生成履歴
CREATE TABLE IF NOT EXISTS ai_generations (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'text',
    provider    TEXT NOT NULL,
    model       TEXT,
    prompt      TEXT NOT NULL,
    result_text TEXT,
    preset_name TEXT,
    tokens_used INTEGER,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_license ON ai_generations(license_id, created_at DESC);

-- AI APIコールログ（レートリミット用）
CREATE TABLE IF NOT EXISTS ai_api_calls (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id  TEXT NOT NULL,
    provider    TEXT NOT NULL,
    called_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_window ON ai_api_calls(license_id, provider, called_at);

-- 組み込みプリセット（license_id=NULL=全ライセンス共有）
INSERT OR IGNORE INTO ai_presets (id, license_id, name, description, prompt_template, variables, is_builtin, created_at) VALUES
('builtin-horoscope', NULL, '星座占い（今日）', '今日の星座の運勢を投稿する',
 'あなたはプロの占い師です。今日の{{星座}}の運勢を、以下の形式で400字以内で書いてください。

【{{星座}}の今日の運勢】
総合運: （ひとこと）
恋愛運: （ひとこと）
仕事運: （ひとこと）
ラッキーカラー: （色）

親しみやすく、ポジティブで、読んだ人が元気になる内容にしてください。ハッシュタグを3つ末尾に付けてください。',
 '["星座"]', 1, 0),

('builtin-tarot', NULL, 'タロット一枚引き', '今日引いたタロットカードのメッセージを投稿する',
 'あなたはタロット占い師です。今日の一枚は「{{カード名}}」でした。このカードが今日あなたに伝えるメッセージを、400字以内で優しく、前向きに書いてください。最後にハッシュタグを3つ付けてください。',
 '["カード名"]', 1, 0),

('builtin-numerology', NULL, '数秘術（今日の数字）', '今日の日付から導かれる数字のメッセージを投稿する',
 'あなたは数秘術の専門家です。今日の数字は「{{数字}}」です。この数字が持つエネルギーと、今日意識するとよいことを350字以内で書いてください。読者が実践できるアドバイスを1つ含め、ハッシュタグを3つ末尾に付けてください。',
 '["数字"]', 1, 0),

('builtin-moon', NULL, '月の満ち欠け', '今日の月相と過ごし方を投稿する',
 'あなたは月のエネルギーに詳しい占い師です。今日は「{{月相}}」の日です（例: 新月・満月・上弦の月）。この月相のエネルギーと、今日おすすめの過ごし方を400字以内で書いてください。ハッシュタグを3つ末尾に付けてください。',
 '["月相"]', 1, 0),

('builtin-custom', NULL, 'カスタム', '自由にプロンプトを入力する',
 '{{プロンプト}}',
 '["プロンプト"]', 1, 0);

-- dev用デフォルト設定
INSERT OR IGNORE INTO ai_settings (license_id, ai_provider, claude_model, ollama_model, max_tokens, key_source, retention_days, updated_at)
VALUES ('dev-license', 'claude', 'claude-haiku-4-5-20251001', 'llama3', 300, 'own', 30, 0);
