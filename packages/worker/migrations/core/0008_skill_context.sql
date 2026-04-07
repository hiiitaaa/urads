-- スキル間コンテキスト共有
CREATE TABLE IF NOT EXISTS skill_contexts (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL,
    skill_name  TEXT NOT NULL,
    output_summary TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_ctx ON skill_contexts(license_id, skill_name, created_at DESC);
