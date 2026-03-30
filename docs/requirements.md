# Urads 要件定義書

## 1. プロジェクト概要

**Urads** — Threads（Meta）自動投稿・リサーチツール

投稿管理、予約投稿、リプライ自動化、競合リサーチを一つのデスクトップアプリで提供する。
有料配布（Stripe決済 + Discord管理）。

## 2. 技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| デスクトップ | **Electron + TypeScript** | Playwright統合・クロスプラットフォーム・自動更新・TS統一 |
| フロントエンド | **React**（Electron Renderer） | エコシステムの豊富さ |
| 画像エディタ | **Fabric.js** | アプリ内テンプレート編集（テキスト合成・レイヤー操作） |
| 画像処理 | **Sharp** | バッチ処理・リサイズ・変換 |
| AI画像生成 | **Stability AI / OpenAI DALL-E** | API経由で画像生成 |
| 動画生成 | **Remotion** | Reactベースのプログラマティック動画生成 |
| バックエンド（常時稼働） | **Cloudflare Workers** | 予約投稿Cron・Webhook受信・ライセンス検証・無料枠 |
| データベース | **Cloudflare D1**（SQLite互換） | 複数端末対応・無料枠 |
| メディア保存 | **Cloudflare R2**（S3互換） | 下書き画像・テンプレアセット。無料枠10GB |
| スクレイピング | **Playwright**（Electron内 Node.js） | ローカルPC起動中に実行 |
| 自動更新 | **electron-updater**（generic provider → Workers経由R2） | ライセンス検証付きDL |
| 決済 | **Stripe**（既存） | Discord管理と統合済み |
| 認証 | **Threads OAuth 2.0** | トークンはサーバー側管理 |

## 3. システム構成図

```
┌───────────────────────────────────────────────────────────┐
│  Electron App（ユーザーのPC）                                │
│                                                             │
│  ┌───────────┐  ┌──────────┐  ┌────────┐  ┌────────────┐ │
│  │ React UI   │  │Playwright │  │ 分析   │  │ Fabric.js  │ │
│  │ 投稿管理   │  │スクレイピング│ │エンジン │  │ 画像エディタ│ │
│  │ ダッシュボード│ │（必要時起動）│ │（ローカル）│ │テンプレ編集 │ │
│  └─────┬─────┘  └────┬─────┘  └───┬────┘  └─────┬──────┘ │
│        │             │             │              │        │
│        │        ローカルアセットフォルダ              │        │
│        │        （画像・テンプレート素材）             │        │
└────────┼─────────────┼─────────────┼──────────────┼────────┘
         │             │             │              │
         ▼             ▼             ▼              ▼
┌───────────────────────────────────────────────────────────┐
│  Cloudflare（常時稼働）                                     │
│                                                             │
│  ┌─ Workers ──────────────────────────────────────────┐    │
│  │  REST API / Cron予約実行 / Webhook受信              │    │
│  │  ライセンス検証（Stripe連携）/ 自動更新配信          │    │
│  └────────────────────────┬───────────────────────────┘    │
│                           │                                 │
│  ┌─ D1 ─────────────┐   ┌┴─ R2 ───────────────────────┐  │
│  │ 投稿・予約         │   │ メディアファイル              │  │
│  │ リプライルール      │   │ アプリ更新バイナリ            │  │
│  │ 分析結果           │   │ 下書き画像                    │  │
│  │ ライセンス         │   │                              │  │
│  │ アカウント状態      │   │                              │  │
│  └───────────────────┘   └──────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
         │
         ▼
  Threads API / Stability AI / DALL-E
```

## 4. フェーズ分割

| Phase | 内容 | 含む機能 |
|-------|------|---------|
| **Phase 1** | 投稿 + 予約 + アカウント管理 + ライセンス | MVP。これだけで有料配布可能 |
| **Phase 2** | リプライ自動化 | Webhook + ルールエンジン |
| **Phase 3** | リサーチ + 分析 | Playwright + ダッシュボード |
| **Phase 4** | 画像/動画エディタ + AI生成 | Fabric.js + Remotion + AI API |

---

## 5. Phase 1 — 投稿 + 予約 + アカウント管理 + ライセンス

### 5.1 機能一覧

| ID | 機能 | 説明 |
|----|------|------|
| F-101 | テキスト投稿 | UIからテキストを入力してThreadsに投稿 |
| F-102 | 画像付き投稿 | 画像ファイルを添付して投稿（複数枚=カルーセル対応） |
| F-103 | 動画付き投稿 | 動画ファイルを添付して投稿 |
| F-104 | 投稿プレビュー | 投稿前にプレビュー表示 |
| F-105 | 予約投稿 | 日時を指定して予約。Cloudflare Cronが実行 |
| F-106 | 予約一覧・編集・削除 | 予約済み投稿の管理UI |
| F-107 | 投稿履歴 | 過去の投稿を一覧表示（ステータス：成功/失敗） |
| F-108 | OAuth認証 | Threads アカウント連携（トークン管理はサーバー側） |
| F-109 | 自動更新 | 起動時にCloudflare R2から更新チェック（ライセンス検証付き） |
| F-110 | 複数アカウント管理 | 最大5アカウント。切替時にUI完全リフレッシュ。状態はD1に保存・復元 |
| F-111 | ライセンス認証 | Stripe連携。初回起動時にキー入力→Workers経由で検証 |

### 5.2 アカウント管理仕様

**5アカウントまで対応。切替時に完全リフレッシュ + 状態保存/復元。**

```
切替フロー:

  アカウントA操作中 → サイドバーでBを選択
    │
    ├─ 1. AのUI状態をD1に保存
    │     ・開いていた画面
    │     ・下書き内容
    │     ・フィルター・検索条件
    │     ・スクロール位置
    │
    ├─ 2. UIを完全クリア（Aの情報が一切残らない）
    │
    └─ 3. BのUI状態をD1から復元
          ・前回Bを使っていた時の画面状態に戻る

  Aに戻す → Aの保存状態が復元される
```

**D1に保存するアカウント状態:**

```json
{
    "account_id": "user_xxx",
    "ui_state": {
        "active_page": "schedules",
        "draft": {
            "content": "下書きテキスト...",
            "media_ids": ["r2_key_1"]
        },
        "filters": {
            "status": "scheduled",
            "date_range": "week"
        },
        "scroll_positions": {
            "schedules": 340,
            "history": 0
        }
    },
    "saved_at": 1711234567
}
```

### 5.3 ライセンス認証

```
購入フロー:
  購入者 → Stripe決済（既存の仕組み）
    → Stripe Webhook → Workers がライセンスキー生成 → D1に保存
    → Discord に通知 + 購入者にロール付与
    → 限定チャンネルでDLリンク + ライセンスキー配布

アプリ側:
  初回起動 → ライセンスキー入力
    → Workers API (POST /license/verify) で検証
    → 有効 → アプリ利用可
    → 無効/期限切れ → ブロック画面

自動更新:
  electron-updater → Workers (GET /update/check) → ライセンス検証
    → 有効 → R2の署名付きURLを返す → ダウンロード+更新
    → 無効 → 更新拒否
```

### 5.4 画面構成

```
┌─ サイドバー ──────────────────────────────────────────┐
│                                                        │
│  ┌─ アカウント切替 ──┐                                  │
│  │ ▼ @account_name   │  ← ドロップダウン（最大5個）     │
│  │   @account_1      │     切替で全画面リフレッシュ      │
│  │   @account_2      │                                  │
│  │   + アカウント追加  │                                  │
│  └──────────────────┘                                  │
│                                                        │
│  [新規投稿]                                             │
│  [予約一覧]                                             │
│  [投稿履歴]                                             │
│  [設定]                                                 │
│                                                        │
│  ─── Phase 2 以降 ───                                   │
│  [リプライルール]                                        │
│  [リサーチ]                                             │
│  [ダッシュボード]                                        │
│  [画像エディタ]                                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**新規投稿画面:**
- テキスト入力エリア（文字数カウント付き / Threads上限 500文字）
- メディア添付（ドラッグ&ドロップ対応 → R2にアップロード）
- 「今すぐ投稿」/「予約投稿」ボタン
- 予約投稿時: 日時ピッカー表示

**予約一覧画面:**
- カレンダー or タイムライン表示
- 各予約の編集・削除・即時実行

**投稿履歴画面:**
- 投稿日時・内容・ステータス（成功/失敗/予約中）
- 失敗時のエラー内容表示

**設定画面:**
- アカウント管理（追加/削除/OAuth再認証）
- ライセンス情報表示
- スクレイピングスケジュール（Phase 3用、初期は非表示）

### 5.5 API設計（Cloudflare Workers）

```
# ライセンス
POST   /license/verify          ライセンスキー検証
GET    /license/status          ライセンス状態確認

# 自動更新
GET    /update/check            更新チェック（ライセンス検証付き）
GET    /update/download         R2署名付きURL発行

# 認証
POST   /auth/callback           Threads OAuthコールバック
DELETE /auth/revoke              トークン無効化

# アカウント
GET    /accounts                 アカウント一覧（最大5）
POST   /accounts                 アカウント追加
DELETE /accounts/:id             アカウント削除
GET    /accounts/:id/state       UI状態取得（切替復元用）
PUT    /accounts/:id/state       UI状態保存（切替保存用）

# 投稿
POST   /posts                   即時投稿
GET    /posts                   投稿履歴取得（account_idでフィルタ）
GET    /posts/:id               投稿詳細

# メディア
POST   /media/upload            R2にアップロード → URLを返す
DELETE /media/:key              R2から削除

# 予約
POST   /schedules               予約作成
GET    /schedules               予約一覧
PUT    /schedules/:id           予約編集
DELETE /schedules/:id           予約削除
POST   /schedules/:id/execute   手動即時実行

# Cron（内部）
GET    /cron/tick                毎分実行 → 期限到達した予約を投稿
```

### 5.6 DBスキーマ（Cloudflare D1）

```sql
-- ライセンス
CREATE TABLE licenses (
    id              TEXT PRIMARY KEY,
    key             TEXT UNIQUE NOT NULL,
    stripe_customer TEXT NOT NULL,
    plan            TEXT DEFAULT 'standard',
    max_accounts    INTEGER DEFAULT 5,
    activated_at    INTEGER,
    expires_at      INTEGER,           -- サブスク期限（買い切りならNULL）
    status          TEXT DEFAULT 'active',  -- 'active' | 'revoked' | 'expired'
    created_at      INTEGER NOT NULL
);

-- アプリ利用者（ライセンスに紐づく）
CREATE TABLE app_users (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL REFERENCES licenses(id),
    device_id       TEXT,              -- 端末識別用
    created_at      INTEGER NOT NULL,
    last_seen_at    INTEGER
);

-- Threadsアカウント（1ライセンスにつき最大5個）
CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL REFERENCES licenses(id),
    threads_user_id TEXT NOT NULL,
    threads_handle  TEXT NOT NULL,      -- @username
    display_name    TEXT,
    access_token    TEXT NOT NULL,      -- 暗号化して保存
    refresh_token   TEXT,
    token_expires_at INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- アカウントUI状態（切替時の保存/復元用）
CREATE TABLE account_states (
    id          TEXT PRIMARY KEY,
    account_id  TEXT UNIQUE NOT NULL REFERENCES accounts(id),
    ui_state    TEXT NOT NULL,          -- JSON（画面・下書き・フィルター・スクロール等）
    saved_at    INTEGER NOT NULL
);

-- 投稿
CREATE TABLE posts (
    id           TEXT PRIMARY KEY,
    account_id   TEXT NOT NULL REFERENCES accounts(id),
    content      TEXT NOT NULL,
    media_type   TEXT,                  -- 'image' | 'video' | 'carousel' | NULL
    media_urls   TEXT,                  -- JSON配列（R2 URL）
    status       TEXT NOT NULL DEFAULT 'draft',
                                       -- 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed'
    threads_id   TEXT,                  -- 投稿成功後のThreads側ID
    error        TEXT,
    scheduled_at INTEGER,
    posted_at    INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_posts_account ON posts(account_id, status);
CREATE INDEX idx_posts_scheduled ON posts(status, scheduled_at)
    WHERE status = 'scheduled';
```

### 5.7 予約投稿の仕組み

```
1. ユーザーが予約作成 → D1に status='scheduled', scheduled_at=指定日時 で保存
   メディアがあればR2にアップロード済み

2. Cron Trigger（毎分実行）→ Workers が D1 を検索
   SELECT * FROM posts
   WHERE status = 'scheduled' AND scheduled_at <= now()
   ORDER BY scheduled_at LIMIT 10

3. 該当投稿のaccount_idからアクセストークン取得

4. Threads API で投稿実行
   メディアがある場合: R2のURLを使ってメディアコンテナ作成 → 投稿

5. 成功 → status='posted', threads_id記録
   失敗 → status='failed', error記録

6. R2の一時メディア → 投稿成功後にライフサイクルルールで自動削除
```

予約上限: **30日先まで**

### 5.8 Threads API Rate Limit 対策

- 250投稿/24h（全アカウント合計ではなく、アカウントごと）
- API呼び出し上限 → Workers側にリクエストキュー実装
- トークン期限切れ → refresh_token で自動更新、失敗時はアプリに通知
- 5アカウント×250 = 1日最大1,250投稿は理論上可能だが、実運用では十分すぎる

---

## 6. Phase 2 — リプライ自動化

### 6.1 機能一覧

| ID | 機能 | 説明 |
|----|------|------|
| F-201 | リプライルール設定 | 投稿ごとにリプライの自動応答ルールを設定 |
| F-202 | キーワードマッチ型 | 特定キーワード（A/B/C等）に対応する回答を返す |
| F-203 | ランダム型 | リプライに対してN個の回答からランダムに返す |
| F-204 | リプライ履歴 | 自動返信の実行ログを確認 |
| F-205 | ルールテンプレート | よく使うルールをテンプレとして保存・再利用 |

### 6.2 リプライルールの構造

```json
{
    "post_id": "xxx",
    "rules": [
        {
            "type": "keyword_match",
            "triggers": ["A", "a", "エー"],
            "response": "あなたの今日の運勢は【大吉】です！...",
            "max_replies": 100
        },
        {
            "type": "random",
            "responses": ["占い結果1", "占い結果2", "...最大50個"],
            "max_replies": 200
        }
    ],
    "global_settings": {
        "cooldown_seconds": 5,
        "active_until": "2026-04-01T00:00:00Z",
        "reply_once_per_user": true
    }
}
```

### 6.3 リプライ検知フロー

```
Threads → Webhook通知 → Cloudflare Workers
                              │
                              ├─ リプライ内容を解析
                              ├─ 該当ルールを D1 から取得
                              ├─ ルール評価（キーワードマッチ or ランダム）
                              ├─ Threads API で返信
                              └─ 実行ログを D1 に記録
```

### 6.4 DBスキーマ追加

```sql
-- リプライルール
CREATE TABLE reply_rules (
    id          TEXT PRIMARY KEY,
    post_id     TEXT NOT NULL REFERENCES posts(id),
    account_id  TEXT NOT NULL REFERENCES accounts(id),
    type        TEXT NOT NULL,          -- 'keyword_match' | 'random'
    config      TEXT NOT NULL,          -- JSON（triggers, responses等）
    max_replies INTEGER DEFAULT 200,
    active      INTEGER DEFAULT 1,
    expires_at  INTEGER,
    created_at  INTEGER NOT NULL
);

-- リプライ実行ログ
CREATE TABLE reply_logs (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT NOT NULL REFERENCES reply_rules(id),
    trigger_user_id TEXT NOT NULL,
    trigger_text    TEXT,
    response_text   TEXT NOT NULL,
    replied_at      INTEGER NOT NULL
);

-- ルールテンプレート
CREATE TABLE rule_templates (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    config      TEXT NOT NULL,          -- JSON
    created_at  INTEGER NOT NULL
);
```

---

## 7. Phase 3 — リサーチ + 分析

### 7.1 機能一覧

| ID | 機能 | 説明 |
|----|------|------|
| F-301 | ベンチマーク登録 | 分析対象のアカウントを登録 |
| F-302 | 投稿収集 | Playwrightで対象アカウントの投稿を自動取得 |
| F-303 | 投稿一覧表示 | サムネイル付きで投稿を閲覧（画像・動画対応） |
| F-304 | バズ検知 | 設定した閾値を超えた投稿を抽出 |
| F-305 | トレンド分析 | 投稿時間帯・ジャンル・エンゲージメントの傾向 |
| F-306 | ダッシュボード | 自分の投稿分析 + 競合比較 |

### 7.2 バズの定義（設定可能）

デフォルト閾値（ユーザーがUI上で変更可能）:

```yaml
buzz_threshold:
    likes: 1000
    replies: 100
    reposts: 50
    # OR条件: いずれかを超えたらバズ判定
```

### 7.3 スクレイピング構成

```
Electron App（ローカルPC）
  │
  ├─ Playwright（ヘッドレス）
  │    ├─ ベンチマークアカウントのプロフィールページ巡回
  │    ├─ 投稿テキスト・画像URL・エンゲージメント数を取得
  │    └─ 結果を JSON で収集
  │
  ├─ スケジューラー
  │    ├─ デフォルト: 1日2回（時刻はUIで設定可能）
  │    ├─ PC起動中のみ実行。停止中はスキップ
  │    └─ 次回起動時に「前回スキップされました」通知 → 手動実行ボタン
  │
  ├─ 分析エンジン（Node.js）
  │    ├─ バズ判定
  │    ├─ 投稿パターン分析（時間帯・曜日・ジャンル）
  │    └─ トレンドスコアリング
  │
  └─ D1 同期
       ├─ 生データ送信（投稿データ）
       └─ 分析結果送信（集計済みJSON）
           → 他端末からもダッシュボードで閲覧可能
```

### 7.4 DBスキーマ追加

```sql
-- ベンチマークアカウント
CREATE TABLE benchmarks (
    id              TEXT PRIMARY KEY,
    license_id      TEXT NOT NULL REFERENCES licenses(id),
    threads_handle  TEXT NOT NULL,
    display_name    TEXT,
    note            TEXT,
    last_scraped_at INTEGER,
    created_at      INTEGER NOT NULL
);

-- 収集した投稿
CREATE TABLE scraped_posts (
    id              TEXT PRIMARY KEY,
    benchmark_id    TEXT NOT NULL REFERENCES benchmarks(id),
    threads_post_id TEXT UNIQUE NOT NULL,
    content         TEXT,
    media_urls      TEXT,              -- JSON配列（サムネイル用）
    likes           INTEGER DEFAULT 0,
    replies         INTEGER DEFAULT 0,
    reposts         INTEGER DEFAULT 0,
    is_buzz         INTEGER DEFAULT 0,
    posted_at       INTEGER,
    scraped_at      INTEGER NOT NULL
);

CREATE INDEX idx_scraped_buzz ON scraped_posts(is_buzz)
    WHERE is_buzz = 1;

-- 分析結果（集計済み）
CREATE TABLE analysis_results (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    type        TEXT NOT NULL,          -- 'trend' | 'benchmark_compare' | 'self_analytics'
    data        TEXT NOT NULL,          -- JSON
    created_at  INTEGER NOT NULL
);

-- スクレイピングスケジュール
CREATE TABLE scrape_schedules (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    time_1      TEXT NOT NULL DEFAULT '08:00',
    time_2      TEXT NOT NULL DEFAULT '20:00',
    last_run_at INTEGER,
    last_status TEXT,                   -- 'success' | 'skipped' | 'failed'
    created_at  INTEGER NOT NULL
);
```

---

## 8. Phase 4 — 画像/動画エディタ + AI生成

### 8.1 機能一覧

| ID | 機能 | 説明 |
|----|------|------|
| F-401 | テンプレートエディタ | Fabric.jsベースの画像エディタ。レイヤー操作・テキスト配置 |
| F-402 | ローカルアセット管理 | PC内の指定フォルダをアセットライブラリとして参照 |
| F-403 | テンプレート保存 | 作成したテンプレートを保存。テキスト差し替えだけで量産可能 |
| F-404 | AI画像生成 | Stability AI / DALL-E APIで画像生成 → エディタに取り込み |
| F-405 | 画像書き出し | PNG/JPGで書き出し → そのまま投稿 or R2に保存 |
| F-406 | 動画生成 | Remotionでテンプレート動画をプログラム生成 |
| F-407 | AI文章生成 | Claude API / ollama で投稿テキストを自動生成 |
| F-408 | プリセットテンプレート | 占い（星座・タロット・数秘術・月相）等の定型プロンプト |
| F-409 | カスタムプロンプト | 自由入力プロンプトで投稿文を生成 |
| F-410 | 変数テンプレート | `{{星座}}` 等のプレースホルダーを差し替えて量産 |

### 8.2 テンプレートエディタ構成

```
┌─ テンプレートエディタ（Fabric.js）──────────────────┐
│                                                      │
│  ┌─ キャンバス ──────────────────────────────────┐  │
│  │                                                │  │
│  │  [背景レイヤー: ローカルアセット or AI生成画像]  │  │
│  │  [テキストレイヤー: ドラッグ配置・フォント変更]  │  │
│  │  [オーバーレイ: ロゴ・枠・装飾]                 │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ ツールバー ─┐  ┌─ アセットパネル ────────────┐  │
│  │ テキスト追加  │  │ ローカルフォルダ参照          │  │
│  │ 画像追加      │  │ サムネイル一覧               │  │
│  │ AI生成       │  │ ドラッグ&ドロップでキャンバスへ│  │
│  │ 書き出し      │  │                              │  │
│  └──────────────┘  └──────────────────────────────┘  │
│                                                      │
│  [テンプレとして保存]  [投稿に使う]                    │
└──────────────────────────────────────────────────────┘
```

### 8.3 アセット管理

```
ローカルPC:
  ユーザーが指定したフォルダ（例: D:/threads_assets/）
    ├── backgrounds/     背景画像
    ├── overlays/        装飾・枠
    ├── logos/           ロゴ
    └── templates/       保存済みテンプレート（JSON）

アプリはこのフォルダを読み取り専用で参照。
テンプレートJSON（Fabric.jsのシリアライズ形式）だけ書き込む。
```

### 8.4 AI文章生成

投稿テキストをAIで自動生成する機能。新規投稿画面から呼び出す。

**対応プロバイダー:**
- **Claude API**（Anthropic SDK） — クラウド。APIキーを設定画面で入力
- **ollama**（ローカルLLM） — ローカルPC上で実行。無料・オフライン可

**プリセットテンプレート（占いアカウント向け）:**

| プリセット | 変数 | 用途 |
|-----------|------|------|
| 星座占い（今日） | `{{星座}}` | 総合運・恋愛運・仕事運・ラッキーカラー |
| タロット一枚引き | `{{カード名}}` | カードのメッセージ |
| 数秘術（今日の数字） | `{{数字}}` | 数字のエネルギーとアドバイス |
| 月の満ち欠け | `{{月相}}` | 月相に合わせた過ごし方 |
| カスタム | `{{プロンプト}}` | 自由入力 |

**生成フロー:**
```
1. 新規投稿画面 → 「AI生成」ボタン
2. プリセット選択 or カスタムプロンプト入力
3. 変数入力（{{星座}} → 「おひつじ座」等）
4. プロバイダー選択（Claude / ollama）
5. バックグラウンドで生成 → 結果をテキスト入力欄に反映
6. ユーザーが編集 → 投稿 or 予約
```

**生成上限:** 300トークン（Threads投稿は500字なので余裕を持たせる）

### 8.5 DBスキーマ追加

```sql
-- AI生成履歴（画像 + 文章の両方を記録）
CREATE TABLE ai_generations (
    id          TEXT PRIMARY KEY,
    account_id  TEXT NOT NULL REFERENCES accounts(id),
    type        TEXT NOT NULL,         -- 'image' | 'text'
    provider    TEXT NOT NULL,         -- 'stability_ai' | 'dall_e' | 'claude' | 'ollama'
    prompt      TEXT NOT NULL,
    result_url  TEXT,                  -- R2 URL（画像の場合）
    result_text TEXT,                  -- 生成テキスト（文章の場合）
    preset_name TEXT,                  -- 使用したプリセット名（任意）
    created_at  INTEGER NOT NULL
);

-- テンプレートメタデータ（実体はローカルJSON）
CREATE TABLE templates (
    id          TEXT PRIMARY KEY,
    license_id  TEXT NOT NULL REFERENCES licenses(id),
    name        TEXT NOT NULL,
    local_path  TEXT NOT NULL,         -- ローカルJSONファイルパス
    thumbnail   TEXT,                  -- R2 URL（他端末プレビュー用）
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

---

## 9. 非機能要件

| 項目 | 要件 |
|------|------|
| 対応OS | Windows / macOS / Linux |
| 自動更新 | electron-updater → Workers経由 → R2からDL（ライセンス検証付き） |
| セキュリティ | OAuthトークンはD1に暗号化保存。ローカルには保持しない |
| ライセンス | Stripe決済。キー検証はWorkers経由。Discord管理 |
| アカウント上限 | 1ライセンスにつき5アカウントまで |
| Rate Limit | Threads API 250投稿/24h/アカウント。Workers側でキュー制御 |
| オフライン | 投稿作成・下書き・テンプレ編集はオフライン可。実行はオンライン必須 |
| ログ | Workers側: Workers Analytics / ローカル: electron-log |
| エラー通知 | 予約投稿失敗・Webhook受信エラー・トークン期限切れ時にアプリ内通知 |
| データ分離 | アカウント切替時に前アカウントのデータが画面に残らない |

---

## 10. 開発ディレクトリ構成

```
Urads/
├── app/                        # Electron メインプロセス
│   ├── main.ts                 # Electron entry
│   ├── preload.ts
│   ├── license.ts              # ライセンス検証
│   ├── updater.ts              # 自動更新
│   └── scraper/                # Playwright スクレイピング（Phase 3）
│       ├── collector.ts
│       ├── scheduler.ts
│       └── analyzer.ts
├── src/                        # React フロントエンド（Renderer）
│   ├── pages/
│   │   ├── PostCompose.tsx     # 新規投稿
│   │   ├── Schedules.tsx       # 予約一覧
│   │   ├── History.tsx         # 投稿履歴
│   │   ├── Settings.tsx        # 設定
│   │   ├── ReplyRules.tsx      # Phase 2
│   │   ├── Research.tsx        # Phase 3
│   │   ├── Dashboard.tsx       # Phase 3
│   │   └── ImageEditor.tsx     # Phase 4
│   ├── components/
│   │   ├── AccountSwitcher.tsx # アカウント切替
│   │   ├── Sidebar.tsx
│   │   ├── MediaUploader.tsx
│   │   └── ...
│   ├── hooks/
│   │   ├── useAccount.ts       # アカウント管理
│   │   ├── useApi.ts           # Workers API呼び出し
│   │   └── ...
│   ├── api/                    # Workers APIクライアント
│   │   ├── client.ts
│   │   ├── posts.ts
│   │   ├── schedules.ts
│   │   ├── accounts.ts
│   │   └── license.ts
│   └── store/                  # 状態管理
│       └── accountStore.ts
├── worker/                     # Cloudflare Workers
│   ├── src/
│   │   ├── index.ts            # ルーター（Hono推奨）
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── accounts.ts
│   │   │   ├── posts.ts
│   │   │   ├── schedules.ts
│   │   │   ├── media.ts
│   │   │   ├── license.ts
│   │   │   ├── update.ts
│   │   │   ├── replies.ts     # Phase 2
│   │   │   └── research.ts    # Phase 3
│   │   ├── cron.ts
│   │   ├── webhook.ts
│   │   └── middleware/
│   │       ├── auth.ts         # リクエスト認証
│   │       └── license.ts      # ライセンス検証
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_replies.sql
│   │   └── 0003_research.sql
│   └── wrangler.toml
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

---

## 11. 全テーブル一覧（ER概要）

```
licenses ─────────┐
  │                │
  ├─ app_users     │
  │                │
  ├─ accounts ─────┤
  │   │            │
  │   ├─ account_states
  │   │            │
  │   ├─ posts ────┤
  │   │   │        │
  │   │   └─ reply_rules ── reply_logs    (Phase 2)
  │   │            │
  │   └─ ai_generations                   (Phase 4)
  │                │
  ├─ rule_templates                       (Phase 2)
  │                │
  ├─ benchmarks ── scraped_posts          (Phase 3)
  │                │
  ├─ analysis_results                     (Phase 3)
  │                │
  ├─ scrape_schedules                     (Phase 3)
  │                │
  └─ templates                            (Phase 4)
```
