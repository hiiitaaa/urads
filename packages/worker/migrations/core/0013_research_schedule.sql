-- 定時リサーチスケジュール + 検索フィルタ設定
ALTER TABLE research_settings ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_settings ADD COLUMN schedule_hour INTEGER NOT NULL DEFAULT 9;
ALTER TABLE research_settings ADD COLUMN schedule_minute INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_settings ADD COLUMN schedule_types TEXT NOT NULL DEFAULT '["trending"]';
ALTER TABLE research_settings ADD COLUMN search_min_likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_settings ADD COLUMN search_max_results INTEGER NOT NULL DEFAULT 50;
