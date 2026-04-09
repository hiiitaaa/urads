# Cloudflare セットアップガイド

Urads の Workers / D1 / R2 環境構築手順。

---

## 1. Cloudflareアカウント

https://dash.cloudflare.com/ でアカウント作成。

---

## 2. Workers & Pages

### 2.1 workers.dev サブドメイン登録

初回のみ。ダッシュボードでの操作:
1. https://dash.cloudflare.com/ → アカウント名をクリック
2. 左メニューの **「ビルド」** → **「コンピュート」** → **「Workers & Pages」**
3. サブドメイン名を決めて登録
例: `nohara-ce` → `*.nohara-ce.workers.dev`

### 2.2 Workers デプロイ

```bash
cd packages/worker
npx wrangler deploy
```

デプロイ先: `https://urads-api.{subdomain}.workers.dev`

---

## 3. D1 データベース

### 3.1 D1 作成

```bash
npx wrangler d1 create urads-db
```

返されたIDを `wrangler.toml` の `database_id` に設定。

### 3.2 マイグレーション実行

```bash
# ローカル
npx wrangler d1 migrations apply urads-db --local

# リモート
npx wrangler d1 migrations apply urads-db --remote
```

---

## 4. R2 ストレージ（画像/動画投稿用）

### 4.1 R2 有効化

1. https://dash.cloudflare.com/{account_id}/r2 を開く
2. 「Get started with R2」→ 規約同意
3. 無料枠: 10GB/月、100万書込/月、1000万読取/月（$0.00）
4. クレジットカード登録が必要な場合あり（課金は0円）

### 4.2 バケット作成

```bash
npx wrangler r2 bucket create urads-media
```

### 4.3 wrangler.toml 設定

```toml
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "urads-media"
```

---

## 5. APIトークン（永続認証）

OAuth認証は頻繁に切れるため、APIトークン方式を推奨。

### 5.1 作成

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. 「Create Token」→「Edit Cloudflare Workers」テンプレート選択
3. Account Resources: 自分のアカウント
4. Zone Resources: All zones
5. 「Continue to summary」→「Create Token」
6. トークンをコピー

### 5.2 環境変数に設定

```bash
# bashrc/zshrc に追加（永続化）
export CLOUDFLARE_API_TOKEN=cfut_xxxxxxxxxxxxx
```

これ以降 `wrangler login` は不要。全てのwranglerコマンドがトークンで認証される。

---

## 6. Secrets（機密情報）

wrangler.toml に平文で書かないもの：

```bash
# Threads App Secret
npx wrangler secret put THREADS_APP_SECRET

# 暗号化キー（本番用）
npx wrangler secret put ENCRYPTION_KEY
```

---

## 7. Docker ローカル開発

```bash
# Workers dev サーバー起動（Docker）
docker compose up -d

# ローカルマイグレーション
docker exec urads-worker-1 sh -c '/app/node_modules/.bin/wrangler d1 migrations apply urads-db --local'

# ヘルスチェック
curl http://localhost:8787/health
```

ローカルの `.dev.vars` ファイルでシークレットを管理：
```
THREADS_APP_SECRET=xxxxxxxxxxxx
```

---

## 8. Cron Triggers

`wrangler.toml`:
```toml
[triggers]
crons = ["* * * * *"]  # 毎分実行
```

ローカルでは手動トリガー：
```bash
curl http://localhost:8787/cdn-cgi/handler/scheduled
```

---

## 料金まとめ

| サービス | 無料枠 | 超過時 |
|---------|--------|--------|
| Workers | 10万リクエスト/日 | $5/月〜 |
| D1 | 読取500万行/日、書込10万行/日 | $5/月〜 |
| R2 | 10GB、100万書込、1000万読取 | $0.015/GB/月 |
| Cron | 無料 | — |
