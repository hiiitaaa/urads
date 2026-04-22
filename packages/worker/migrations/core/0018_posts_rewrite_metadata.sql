-- バズ自動リライト機能: 下書き保存用の posts 拡張
-- 設計: docs/buzz_rewrite_design.md §5.7 §5.8

-- 元バズ投稿への soft reference（FK なし: scraped_posts は retention で消えるため）
ALTER TABLE posts ADD COLUMN source_scraped_post_id TEXT;

-- リライト メタデータ（全案 / ガードレール結果 / cost 等 JSON）
ALTER TABLE posts ADD COLUMN rewrite_metadata TEXT;

-- 生成時の persona ハッシュ（UNIQUE キー構成要素）
ALTER TABLE posts ADD COLUMN persona_hash TEXT;

-- 冪等性保証: 同じ (元投稿, persona バージョン) から2つ下書きを作れない
-- 通常投稿（source_scraped_post_id IS NULL）には制約を及ぼさない部分 UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_rewrite_source
ON posts (source_scraped_post_id, persona_hash)
WHERE source_scraped_post_id IS NOT NULL;
