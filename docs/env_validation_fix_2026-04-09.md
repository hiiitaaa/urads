# 環境変数バリデーション・プレースホルダー修正記録（2026-04-09）

## 概要

OAuth認証エラー（`{"error_message":"An unknown error has occurred.","error_code":1}`）の原因調査と対策。
`wrangler.toml` の環境変数がプレースホルダーのまま本番Workerにデプロイされていた。

## 発見された問題

### 直接原因: 認証に必要な変数が全て未設定

| 変数 | 場所 | 状態 |
|------|------|------|
| `THREADS_APP_ID` | `wrangler.toml` [vars] | `YOUR_THREADS_APP_ID`（プレースホルダー） |
| `THREADS_APP_SECRET` | wrangler secret | 未設定 |
| `ENCRYPTION_KEY` | wrangler secret | 未設定 |
| `WEBHOOK_VERIFY_TOKEN` | webhook.ts ハードコード | ダミー値 `'urads-webhook-verify'` |

### 根本原因

`scripts/setup.sh` を実行せずに `database_id` だけ手動で設定してデプロイした。
セットアップスクリプトは上記4変数を自動設定する機能を持っているが、使われていなかった。

### コード上の問題

- Worker起動時にプレースホルダー検知がなく、デプロイ後に気づけなかった
- `ENCRYPTION_KEY` 未設定時にTypeErrorが発生し、原因が分かりにくかった
- `setup.sh` を再実行すると `ENCRYPTION_KEY` が上書きされ、既存の暗号化トークンが復号不能になるバグがあった

## 今回のコード修正内容

### 1. Worker起動時バリデーション（`packages/worker/src/index.ts`）

`/health` 以外の全エンドポイントに環境変数チェックミドルウェアを追加。
`THREADS_APP_ID` がプレースホルダーまたは `ENCRYPTION_KEY` が未設定の場合、500エラー + console.errorで明示。

### 2. ENCRYPTION_KEY未設定ガード（`packages/worker/src/infrastructure/crypto.ts`）

`encryptField()` / `decryptField()` の先頭で未設定チェック。
TypeErrorではなく「ENCRYPTION_KEY が設定されていません」と明示メッセージを返す。

### 3. WEBHOOK_VERIFY_TOKEN の改善（3点セット）

- `packages/worker/src/env.ts`: `WEBHOOK_VERIFY_TOKEN` をオプションから必須に変更
- `packages/worker/src/modules/reply/webhook.ts`: ダミーフォールバック削除
- `scripts/setup.sh`, `scripts/setup.bat`: 自動生成ステップ追加

### 4. setup.sh/bat の再実行安全性

`ENCRYPTION_KEY` と `WEBHOOK_VERIFY_TOKEN` が既に設定済みの場合はスキップするガードを追加。
再実行で既存の暗号化トークンが無効になる事故を防止。

## 修正ファイル一覧

| ファイル | 変更 |
|---------|------|
| `packages/worker/src/index.ts` | 起動時バリデーションミドルウェア追加 |
| `packages/worker/src/infrastructure/crypto.ts` | ENCRYPTION_KEY未設定ガード |
| `packages/worker/src/env.ts` | WEBHOOK_VERIFY_TOKEN を必須型に |
| `packages/worker/src/modules/reply/webhook.ts` | ダミーフォールバック削除 |
| `scripts/setup.sh` | WEBHOOK_VERIFY_TOKEN追加 + 再生成防止ガード |
| `scripts/setup.bat` | 同上 |

---

## プルしてからやること

### 方法A: セットアップスクリプトを使う（推奨）

```bash
git pull
cd scripts
bash setup.sh
```

スクリプトが対話形式で以下を実行する:
1. D1データベース作成（既存ならスキップ）
2. R2バケット作成（既存ならスキップ）
3. `wrangler.toml` の `YOUR_THREADS_APP_ID` を入力値で置換
4. `THREADS_APP_SECRET` を入力 → `wrangler secret put`
5. `ENCRYPTION_KEY` を自動生成 → `wrangler secret put`（既存ならスキップ）
6. `WEBHOOK_VERIFY_TOKEN` を自動生成 → `wrangler secret put`（既存ならスキップ）
7. D1マイグレーション実行
8. Workerデプロイ

### 方法B: 手動で設定する

```bash
git pull
cd packages/worker

# 1. wrangler.toml の THREADS_APP_ID を実際の値に置換
#    YOUR_THREADS_APP_ID → Meta Developer Portal のApp ID に書き換え

# 2. シークレット設定
npx wrangler secret put THREADS_APP_SECRET
# → Meta Developer Portal のApp Secretを入力

npx wrangler secret put ENCRYPTION_KEY
# → 以下で生成した値を入力:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npx wrangler secret put WEBHOOK_VERIFY_TOKEN
# → 以下で生成した値を入力:
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. デプロイ
npx wrangler deploy
```

### 設定後の確認

```bash
# シークレットが設定されているか確認
npx wrangler secret list
# → THREADS_APP_SECRET, ENCRYPTION_KEY, WEBHOOK_VERIFY_TOKEN が表示されればOK

# Workerが正常に動作しているか確認
curl https://urads-api.YOUR_SUBDOMAIN.workers.dev/health
# → {"status":"ok","timestamp":...}

curl https://urads-api.YOUR_SUBDOMAIN.workers.dev/accounts
# → CONFIG_ERROR でなくアカウント一覧が返ればOK
```

### 確認後、Electronアプリから認証

1. アプリを起動
2. セットアップウィザードで「共有サーバー」を選択（または自分のWorker URLを入力）
3. 「Threads アカウントを連携する」をクリック
4. Threadsログイン画面が表示され、認証が完了すればOK

## 未対応（別タスク）

| 項目 | 理由 |
|------|------|
| `auth/routes.ts` の `client_secret` がURLクエリに含まれる | Cloudflareログに平文で残る。POSTボディに移行すべき |
| Webhook POST署名検証（`X-Hub-Signature-256`） | Phase 2リリース前に必須 |
| 認証強化（X-License-Id必須化） | 前回のセキュリティ修正で別タスクとした |
