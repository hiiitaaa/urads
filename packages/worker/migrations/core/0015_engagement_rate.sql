-- リサーチ強化: エンゲージメント率 + メディア + カテゴリ + 設定

-- scraped_posts 拡張
ALTER TABLE scraped_posts ADD COLUMN engagement_rate REAL;
ALTER TABLE scraped_posts ADD COLUMN follower_snapshot INTEGER;
ALTER TABLE scraped_posts ADD COLUMN media_type TEXT;

-- benchmarks 拡張
ALTER TABLE benchmarks ADD COLUMN category TEXT;

-- research_settings 拡張
ALTER TABLE research_settings ADD COLUMN benchmark_scrape_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE research_settings ADD COLUMN search_filter_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE research_settings ADD COLUMN buzz_engagement_rate REAL NOT NULL DEFAULT 0.08;

-- パフォーマンス用インデックス
CREATE INDEX IF NOT EXISTS idx_sp_benchmark_date ON scraped_posts(benchmark_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sp_buzz ON scraped_posts(benchmark_id, is_buzz, posted_at DESC);
