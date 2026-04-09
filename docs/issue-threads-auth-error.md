# Issue: Threads OAuth認証エラー

## エラー内容

```json
{"error_message":"An unknown error has occurred.","error_code":1}
```

## 原因

Cloudflare Workerの環境変数 `THREADS_APP_ID` がプレースホルダー (`YOUR_THREADS_APP_ID`) のまま。
OAuth認可URLに実際のApp IDが入っていないため、Threads APIがエラーを返す。

## ログ証拠

```
[oauth] Navigation: https://www.threads.com/oauth/authorize?client_id=YOUR_THREADS_APP_ID&redirect_uri=https%3A%2F%2Floc...
[oauth] Navigation: https://www.threads.com/oauth/authorize/error.json?error_message=An+unknown+error+has+occurred.&erro...
```

## 対応

Cloudflare Workerの以下の環境変数を正しい値に設定する:

- `THREADS_APP_ID` — Meta Developer Portalから取得
- `THREADS_APP_SECRET` — Meta Developer Portalから取得
- `THREADS_REDIRECT_URI` — `https://localhost:8890/callback`（現在の設定値）

### 設定方法

```bash
# Cloudflare Dashboard > Workers > urads-api > Settings > Variables
# または
npx wrangler secret put THREADS_APP_ID
npx wrangler secret put THREADS_APP_SECRET
npx wrangler secret put THREADS_REDIRECT_URI
```

## 発見日

2026-04-09
