# Urads 個別サーバーセットアップ — AIエージェント用手順書

## 目的

ユーザーが自分のCloudflareアカウントにUradsのバックエンド（Workers + D1 + R2）をデプロイし、Electronアプリから接続できる状態にする。

## 前提条件

- Node.js 20+ がインストール済み
- Git がインストール済み
- `corepack enable` 実行済み（pnpm有効化）
- ユーザーがCloudflareアカウントを持っている（なければ作成を案内）
- ユーザーがThreads APIのApp IDとApp Secretを取得済み（なければ取得手順を案内）

## このガイドでやること

Cloudflare上にUradsバックエンドをデプロイする環境構築のみ。

## このガイドでやらないこと

- Threads APIのApp ID/Secret取得（Meta Developer Portalでの手動作業が必要）
- Threads OAuthのテスター承認（スマホのThreadsアプリでの手動操作が必要）
- Electronアプリのビルド

---

## Step 1: リポジトリ取得

```bash
git clone https://github.com/YOUR_USERNAME/urads.git
cd urads
```

**成功判定:** `packages/worker/wrangler.toml` が存在する

---

## Step 2: 依存関係インストール

```bash
pnpm install
```

**成功判定:** `node_modules/` が作成され、exit code 0

---

## Step 3: Cloudflare認証

```bash
npx wrangler whoami
```

**分岐:**
- ログイン済み → Step 4へ
- 未ログイン → ユーザーに以下を案内:

```
npx wrangler login を実行してください。
ブラウザが開くので「Allow」をクリックしてください。
```

**⚠ 人間の操作が必要:** ブラウザでのOAuth認証。エージェントは実行できない。

**成功判定:** `npx wrangler whoami` がアカウント名を返す

---

## Step 4: D1データベース作成

```bash
cd packages/worker
npx wrangler d1 create urads-db
```

**分岐:**
- 成功 → 出力からdatabase_idを取得（`uuid` フィールド）
- 「already exists」エラー → `npx wrangler d1 list` でIDを取得

**取得したIDを `wrangler.toml` に書き込む:**

```toml
[[d1_databases]]
binding = "DB"
database_name = "urads-db"
database_id = "<取得したID>"
```

**成功判定:** `wrangler.toml` の `database_id` がUUID形式の値になっている

---

## Step 5: R2バケット作成

```bash
npx wrangler r2 bucket create urads-media
```

**分岐:**
- 成功 → 次へ
- 「already exists」エラー → 問題なし、次へ

**成功判定:** `npx wrangler r2 bucket list` に `urads-media` が存在する

---

## Step 6: Threads API設定

**⚠ 人間に確認が必要:** App IDとApp Secretをユーザーに聞く。

```
Threads APIの App ID と App Secret を教えてください。
Meta Developer Portal (developers.facebook.com) → アプリ → 設定 → 基本 で確認できます。
```

取得したら `wrangler.toml` の `[vars]` セクションを更新:

```toml
[vars]
THREADS_APP_ID = "<ユーザーから受け取ったApp ID>"
THREADS_REDIRECT_URI = "https://localhost:8890/callback"
```

**成功判定:** `THREADS_APP_ID` が数字の文字列になっている

---

## Step 7: Secrets設定

### 7-1. THREADS_APP_SECRET

```bash
echo "<ユーザーから受け取ったApp Secret>" | npx wrangler secret put THREADS_APP_SECRET
```

**分岐:**
- 「already in use」エラー → 既に設定済み。ユーザーに「上書きしますか？」確認

### 7-2. ENCRYPTION_KEY

ランダムな暗号化キーを生成して設定:

```bash
# キー生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成された値を設定
echo "<生成した値>" | npx wrangler secret put ENCRYPTION_KEY
```

**分岐:**
- 「already in use」エラー → 既に設定済み。変更不要

**成功判定:** `npx wrangler secret list` に `THREADS_APP_SECRET` と `ENCRYPTION_KEY` が存在する

---

## Step 8: データベースマイグレーション

```bash
npx wrangler d1 migrations apply urads-db --remote
```

**成功判定:** 全migrationが ✅ になっている

---

## Step 9: デプロイ

```bash
npx wrangler deploy
```

**成功判定:** 出力に `https://urads-api.<subdomain>.workers.dev` のURLが表示される

---

## Step 10: 動作確認

```bash
curl https://urads-api.<subdomain>.workers.dev/health
```

**成功判定:** `{"status":"ok","timestamp":...}` が返る

---

## Step 11: ユーザーに完了報告

以下を伝える:

```
セットアップ完了です。

あなたのWorkers URL: https://urads-api.<subdomain>.workers.dev

Uradsアプリを起動して:
1. セットアップ画面で「自分のサーバーを使う」をクリック
2. 上記URLを貼り付けて「接続テスト」
3. Threadsアカウントを連携

※ Threadsアプリ（スマホ）で開発者招待の承認が済んでいることを確認してください。
  設定 → アカウント → ウェブサイトのアクセス許可 → 招待 → 承認
```

---

## エラー対処

| エラー | 原因 | 対処 |
|--------|------|------|
| `Authentication error [code: 10000]` | Cloudflare認証切れ or 権限不足 | `npx wrangler login` を再実行 |
| `A database with that name already exists` | D1が既に存在 | `npx wrangler d1 list` でID取得して続行 |
| `Binding name already in use` | Secret設定済み | 変更不要。スキップ |
| `Failed to publish` | wrangler.tomlの設定不備 | database_id, THREADS_APP_IDを確認 |
| `/health` が応答しない | デプロイ失敗 | `npx wrangler deploy` のエラー出力を確認 |
