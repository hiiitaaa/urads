@echo off
setlocal enabledelayedexpansion

echo ======================================
echo   Urads セットアップ
echo ======================================
echo.

set WRANGLER=npx wrangler
set TOML=packages\worker\wrangler.toml

:: 前提チェック
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js がインストールされていません
    echo   winget install OpenJS.NodeJS
    exit /b 1
)

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo pnpm が見つかりません。有効化します...
    corepack enable
    corepack prepare pnpm@latest --activate
)

:: 依存インストール
echo [1/9] 依存パッケージをインストール中...
call pnpm install

:: Cloudflare ログイン
echo.
echo [2/9] Cloudflare にログインします...
echo   ブラウザが開きます。Cloudflareアカウントで「許可」を押してください。
call %WRANGLER% login

:: D1 作成
echo.
echo [3/9] D1 データベースを作成中...
call %WRANGLER% d1 create urads-db 2>&1 || echo   (既に存在する場合はOK)
echo.
echo   Cloudflare Dashboard ( https://dash.cloudflare.com/ ) で
echo   Workers ^& Pages → D1 → urads-db を開き、Database ID をコピーしてください。
echo.
set /p DB_ID="  database_id を入力: "

:: R2 作成
echo.
echo [4/9] R2 バケットを作成中...
call %WRANGLER% r2 bucket create urads-media 2>&1 || echo   (既に存在する場合はOK)

:: wrangler.toml 更新
echo.
echo [5/9] wrangler.toml を更新中...

echo.
echo   Threads API の APP_ID を入力してください
echo   (Meta Developer Portal → アプリ → 「Access Threads API」で確認)
set /p APP_ID="  THREADS_APP_ID: "

:: PowerShell で置換
powershell -Command "(Get-Content '%TOML%') -replace 'YOUR_D1_DATABASE_ID', '%DB_ID%' | Set-Content '%TOML%'"
powershell -Command "(Get-Content '%TOML%') -replace 'YOUR_THREADS_APP_ID', '%APP_ID%' | Set-Content '%TOML%'"

:: Secrets
echo.
echo [6/9] Secrets を設定中...
echo.
echo   Threads API の APP_SECRET を入力してください
echo   (Meta Developer Portal → アプリ → 「設定」→「基本」→「App Secret」)
call %WRANGLER% secret put THREADS_APP_SECRET

echo.
echo   暗号化キーを自動生成して設定します...
for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set ENC_KEY=%%i
echo !ENC_KEY! | call %WRANGLER% secret put ENCRYPTION_KEY
echo   ENCRYPTION_KEY: 自動生成済み

:: マイグレーション
echo.
echo [7/9] データベースマイグレーション...
call %WRANGLER% d1 migrations apply urads-db --remote

:: デプロイ
echo.
echo [8/9] Workers をデプロイ中...
call %WRANGLER% deploy

:: Playwright
echo.
echo [9/9] Playwright ブラウザをインストール中...
call npx playwright install chromium

:: .env 作成
echo.
echo ======================================
echo   セットアップ完了!
echo ======================================
echo.
echo Workers URL を確認してください（上のデプロイ出力に表示されています）
set /p WORKERS_URL="  Workers URL (https://...workers.dev): "

:: .env 書き込み
set ENV_FILE=packages\electron\.env
(
echo URADS_API_BASE=%WORKERS_URL%
echo THREADS_APP_ID=%APP_ID%
echo THREADS_REDIRECT_URI=https://localhost:8890/callback
) > "%ENV_FILE%"
echo .env ファイルを作成しました: %ENV_FILE%

echo.
echo 次のステップ:
echo   pnpm dev    # アプリを起動
echo   → 設定 → 「Threadsアカウントを追加」でOAuth認証

endlocal
