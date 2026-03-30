# Urads セットアップガイド

新規環境にUradsを導入する手順書。Mac / Windows 両対応。
目標: **50分で完了**（初めてなら60分）。

> **Docker は不要です。** バックエンドは Cloudflare Workers に直接デプロイします。

---

## Step 1: 前提ツールのインストール（5分）

### Node.js 20+

- **Mac**: https://nodejs.org/ からLTS版をダウンロード、または `brew install node`
- **Win**: https://nodejs.org/ からLTS版をダウンロード、または `winget install OpenJS.NodeJS`

インストール確認:
```bash
node --version   # v20.x.x 以上
```

### pnpm（パッケージマネージャー）

```bash
corepack enable
```

### Git

- **Mac**: `brew install git` または Xcode Command Line Tools
- **Win**: https://git-scm.com/download/win からダウンロード、または `winget install Git.Git`

---

## Step 2: Cloudflare アカウント作成（10分）

Urads のバックエンド（API・データベース・ファイル保存）は Cloudflare で動きます。

### 2-1. アカウント作成

1. https://dash.cloudflare.com/sign-up を開く
2. メールアドレスとパスワードで登録
3. メール確認

> **料金**: 無料プランで十分です（Workers 10万リクエスト/日、D1 500万読取/日、R2 10GB）

### 2-2. Wrangler ログイン

ターミナルで:
```bash
npx wrangler login
```

ブラウザが開きます。Cloudflare アカウントで「許可」を押すだけです。

---

## Step 3: Threads API セットアップ（20分）

自分の Threads アカウントで投稿するための API 設定です。

> **この手順が一番時間がかかります。** 初めての場合は20分見てください。

### 3-1. Facebook 二段階認証（2FA）の有効化

Meta Developer Portal を使うには 2FA が**必須**です。

1. https://www.facebook.com/settings → 「セキュリティとログイン」
2. 「二段階認証を使用」→ 認証アプリを選択
3. Google Authenticator 等のアプリでQRコードをスキャン
4. 確認コードを入力して有効化

> 認証アプリをまだ持っていない場合、App Store / Google Play から「Google Authenticator」をインストールしてください。

### 3-2. Facebook ページの作成

開発者ポータルにアクセスするために Facebook ページが必要です（1分で作れます）。

1. https://www.facebook.com/pages/create を開く
2. 「ビジネスまたはブランド」→ 適当な名前を入力 → 作成
3. カテゴリは何でもOK

### 3-3. Meta Developer Portal でアプリ作成

1. https://developers.facebook.com/ を開く → 「マイアプリ」
2. 「アプリを作成」をクリック
3. **「Access Threads API」** を選択（他のオプションではなく、これを選ぶ）
4. アプリ名を入力（例: 「Urads」）→ 作成

### 3-4. リダイレクト URI の設定

アプリの設定画面で:

1. 左メニュー「Threadsログイン」→「設定」
2. 以下の3つを**すべて**入力（1つでも欠けると保存できません）:

| 項目 | 値（コピペ用） |
|------|----------------|
| **Threads リダイレクト コールバック URL** | `https://localhost:8890/callback` |
| **アカウント削除リクエスト コールバック URL** | `https://localhost:8890/uninstall` |
| **データ削除リクエスト コールバック URL** | `https://localhost:8890/delete` |

3. 「変更を保存」

> ローカルにHTTPSサーバーを立てる必要はありません。Electron が自動的にリダイレクトをキャッチします。

### 3-5. APP_ID と APP_SECRET をメモ

1. 左メニュー「設定」→「基本」
2. **App ID** と **App Secret**（「表示」を押す）をメモ

> **注意**: ここに表示される App ID が Threads API で使う値です。

### 3-6. テスターの追加

自分の Threads アカウントを「テスター」として追加します:

1. 左メニュー「アプリの役割」→「役割」
2. 「Threads テスター」セクションで「追加」
3. 自分の **Threads ユーザー名**を入力して追加

**重要: Threads アプリ内で招待を承認する必要があります:**
1. スマホで Threads アプリを開く
2. プロフィール → 設定 → 「ウェブサイトのアクセス許可」
3. 「招待」タブに表示される招待を **承認**

> 承認しないと OAuth 認証が失敗します。ここが一番迷いやすいポイントです。

詳細な手順は [docs/threads_api_setup.md](threads_api_setup.md) を参照。

---

## Step 4: コード取得 + 自動デプロイ（10分）

### 4-1. リポジトリ取得

```bash
git clone https://github.com/nohara-ce/urads.git
cd urads
```

### 4-2. セットアップスクリプト実行

**Mac / Linux:**
```bash
pnpm setup
```

**Windows:**
```bash
pnpm setup:win
```

スクリプトが自動で以下を行います:
1. 依存パッケージのインストール
2. Cloudflare D1（データベース）作成
3. Cloudflare R2（ファイル保存）作成
4. Threads APP_ID / APP_SECRET の入力（対話式）
5. 暗号化キーの自動生成
6. データベースのテーブル作成
7. Workers のデプロイ
8. Playwright ブラウザのインストール
9. `.env` ファイルの自動作成

> スクリプトの途中で **APP_ID** と **APP_SECRET** の入力を求められます。Step 3 でメモした値を貼り付けてください。

---

## Step 5: 起動 + 初回セットアップ（5分）

### 5-1. アプリ起動

```bash
pnpm dev
```

### 5-2. Threads アカウント追加

1. サイドバー「設定」を開く
2. 「Threads アカウントを追加」ボタンを押す
3. ブラウザが開くので、Threads アカウントでログイン → 認可
4. 認証成功でアカウントが追加される

### 5-3. 動作確認

1. サイドバー「新規投稿」→ テスト投稿を作成 → 投稿
2. Threads でテスト投稿が表示されることを確認

**セットアップ完了!**

---

## リサーチ機能のセットアップ（オプション）

トレンド取得・競合分析・検索・Insights 機能を使うには、Playwright でのログインが必要です:

1. サイドバー「リサーチ」を開く
2. 「ブラウザで Threads にログイン」ボタンを押す
3. Chromium が開くので Threads にログイン
4. ログイン後、ブラウザを閉じる → Cookie が暗号化保存される

> Mac で Playwright のインストールに問題がある場合:
> ```bash
> npx playwright install --with-deps chromium
> ```

---

## 毎日の起動

```bash
cd urads
pnpm dev
```

> Workers は Cloudflare 上で常時稼働しているため、ローカルで起動するのは Electron だけです。

---

## Mac 固有の注意点

- **Gatekeeper 警告**: ビルド版を初回起動時に「開発元を確認できない」と表示された場合:
  ```bash
  xattr -cr /path/to/Urads.app
  ```

---

## Windows 固有の注意点

- **PowerShell 実行ポリシー**: スクリプトが実行できない場合:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- **Windows Defender**: Playwright の Chromium がブロックされる場合、プロジェクトフォルダを除外設定に追加

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `OAuth 認証失敗` | リダイレクトURIが不一致 | Meta Developer Console の3つのURIを再確認 |
| `OAuth 認証失敗` | テスター未承認 | Threads アプリ内で招待を承認 |
| `Workers 接続エラー` | デプロイされていない | `cd packages/worker && npx wrangler deploy` |
| `スクレイプ失敗` | Playwright 未ログイン | リサーチ画面から「ブラウザでログイン」を再実行 |
| `pnpm: command not found` | corepack 未有効化 | `corepack enable` を実行 |
| `wrangler: not logged in` | CF ログイン切れ | `npx wrangler login` を再実行 |

---

## ログファイルの場所

エラー調査が必要な場合、以下のファイルを送ってください:

- **Mac**: `~/Library/Logs/Urads/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Urads\logs\main.log`

---

## リファレンス

- [Cloudflare 詳細セットアップ](cloudflare_setup.md)
- [Threads API 詳細セットアップ](threads_api_setup.md)
- [安全運用ガイド](threads_safety_guide.md)
