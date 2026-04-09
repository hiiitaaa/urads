#!/bin/bash
set -e

echo "======================================"
echo "  Urads セットアップ"
echo "======================================"
echo ""

WRANGLER="npx wrangler"
TOML="packages/worker/wrangler.toml"

# 前提チェック
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js がインストールされていません"
  echo "  Mac: brew install node"
  echo "  Win: winget install OpenJS.NodeJS"
  exit 1
fi

if ! command -v pnpm &> /dev/null; then
  echo "pnpm が見つかりません。有効化します..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi

# 依存インストール
echo "[1/8] 依存パッケージをインストール中..."
pnpm install

# Cloudflare ログイン確認
echo ""
echo "[2/8] Cloudflare にログインします..."
echo "  ブラウザが開きます。Cloudflareアカウントで「許可」を押してください。"
$WRANGLER login

# D1 データベース作成
echo ""
echo "[3/8] D1 データベースを作成中..."
D1_OUTPUT=$($WRANGLER d1 create urads-db 2>&1) || true

# database_id を抽出
DB_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+' || echo "")
if [ -z "$DB_ID" ]; then
  # 既に存在する場合
  DB_ID=$(echo "$D1_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
fi

if [ -z "$DB_ID" ]; then
  echo "WARNING: database_id を自動取得できませんでした"
  echo "  $WRANGLER d1 list で確認し、wrangler.toml に手動で記入してください"
  read -p "database_id を入力: " DB_ID
fi

echo "  database_id: $DB_ID"

# R2 バケット作成
echo ""
echo "[4/8] R2 バケットを作成中..."
$WRANGLER r2 bucket create urads-media 2>&1 || echo "  (既に存在する場合はOK)"

# wrangler.toml 更新
echo ""
echo "[5/8] wrangler.toml を更新中..."

# database_id (macOS/Linux両対応)
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/YOUR_D1_DATABASE_ID/$DB_ID/" "$TOML"
else
  sed -i "s/YOUR_D1_DATABASE_ID/$DB_ID/" "$TOML"
fi

# THREADS_APP_ID
echo ""
echo "  Threads API の APP_ID を入力してください"
echo "  (Meta Developer Portal → アプリ → 「Access Threads API」で確認)"
read -p "  THREADS_APP_ID: " APP_ID
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/YOUR_THREADS_APP_ID/$APP_ID/" "$TOML"
else
  sed -i "s/YOUR_THREADS_APP_ID/$APP_ID/" "$TOML"
fi

# Secrets 設定
echo ""
echo "[6/8] Secrets を設定中..."
echo ""
echo "  Threads API の APP_SECRET を入力してください"
echo "  (Meta Developer Portal → アプリ → 「設定」→「基本」→「App Secret」)"
$WRANGLER secret put THREADS_APP_SECRET

echo ""
echo "  暗号化キーを自動生成して設定します..."
if $WRANGLER secret list 2>/dev/null | grep -q ENCRYPTION_KEY; then
  echo "  ⚠ ENCRYPTION_KEY は既に設定済みです。スキップします。"
  echo "    （再生成すると既存の暗号化トークンが無効になります）"
else
  ENC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  printf '%s' "$ENC_KEY" | $WRANGLER secret put ENCRYPTION_KEY
  echo "  ENCRYPTION_KEY: 自動生成済み"
fi

echo ""
echo "  Webhook検証トークンを自動生成して設定します..."
if $WRANGLER secret list 2>/dev/null | grep -q WEBHOOK_VERIFY_TOKEN; then
  echo "  ⚠ WEBHOOK_VERIFY_TOKEN は既に設定済みです。スキップします。"
else
  WH_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  printf '%s' "$WH_TOKEN" | $WRANGLER secret put WEBHOOK_VERIFY_TOKEN
  echo "  WEBHOOK_VERIFY_TOKEN: 自動生成済み"
fi

# マイグレーション
echo ""
echo "[7/8] データベースマイグレーション..."
$WRANGLER d1 migrations apply urads-db --remote

# デプロイ
echo ""
echo "[8/8] Workers をデプロイ中..."
DEPLOY_OUTPUT=$($WRANGLER deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Workers URL 抽出
WORKERS_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-z0-9-]+\.workers\.dev' | head -1 || echo "")

# スクレイパーはシステムのGoogle Chromeを使用（Playwrightブラウザのインストール不要）

# .env ファイル作成
echo ""
echo "======================================"
echo "  セットアップ完了!"
echo "======================================"
echo ""

if [ -n "$WORKERS_URL" ]; then
  echo "Workers URL: $WORKERS_URL"
  echo ""

  # .env に書き込み
  ENV_FILE="packages/electron/.env"
  cat > "$ENV_FILE" << EOF
URADS_API_BASE=$WORKERS_URL
THREADS_APP_ID=$APP_ID
THREADS_REDIRECT_URI=https://localhost:8890/callback
EOF
  echo ".env ファイルを作成しました: $ENV_FILE"
else
  echo "WARNING: Workers URL を自動取得できませんでした"
  echo "  packages/electron/.env に URADS_API_BASE=<Workers URL> を手動で記入してください"
fi

echo ""
echo "次のステップ:"
echo "  pnpm dev    # アプリを起動"
echo "  → 設定 → 「Threadsアカウントを追加」でOAuth認証"
