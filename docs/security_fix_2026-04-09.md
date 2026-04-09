# セキュリティ修正記録（2026-04-09）

## 概要

配布バイナリ（exe/dmg）から個人Cloudflareアカウント名が漏洩していた問題を修正。
併せて、情報露出防止（エラーメッセージ・ログ）とセットアップUIの改善を実施。

## 発見された問題

### Critical: 個人情報漏洩
- `src/config.ts` に `https://urads-api.nohara-ce.workers.dev` がハードコード
- ビルド後の `dist/renderer/assets/*.js` に平文で埋め込まれ、配布物から個人特定可能
- `docs/` 5ファイルに `github.com/nohara-ce/urads` が記載
- `release/` ディレクトリ（app.asar含む）がgit管理下に入っていた

### High: 情報露出
- Worker APIが `err.message` をそのままレスポンスに返却 → DB構造やスタックトレースが外部に漏洩
- チャットログがユーザー入力メッセージ + AI応答の先頭500文字をサーバーに全文送信

### ビルド時バグ
- Renderer側デフォルト（`nohara-ce.workers.dev`）と Main process側デフォルト（`localhost:8787`）が不整合
- 新規ビルド時にどのサーバーURLを入力すべきか不明

## 修正内容

### 1. URL管理の一元化

| 変更 | ファイル |
|------|---------|
| 共有サーバーURL定義を1箇所に集約 | `app/modules/config/shared-server.ts`（**新規**） |
| Renderer側ハードコード削除（初期値を空文字に） | `src/config.ts` |
| デフォルトURL不整合を解消 + `isShared`フラグ追加 | `app/modules/config/app-config-store.ts` |
| IPC追加（setSharedServer, isSharedServer）| `app/main.ts`, `app/preload.ts` |

**設計判断:**
- 共有サーバーURLは Main process側（`shared-server.ts`）のみに存在
- Rendererバンドル（`dist/renderer/`）には含まれない → 配布JSから個人名が消える
- asar内のMain processバンドルには残るが、UIやRendererソースからは不可視
- `isShared: boolean` フラグで共有/カスタムを判定（URL文字列比較はしない）

### 2. 既存ユーザー保護（マイグレーション）

`app-config-store.ts` に `migrateConfig()` を追加。
`app.whenReady()` で `createWindow()` 前に1回実行。

```
workersUrl == null && setupCompleted == true
  → 旧バージョンユーザーと判定
  → 共有サーバーURLを自動設定（isShared = true）
```

### 3. セットアップUI改善

**SetupWizard（`src/modules/setup/SetupWizard.tsx`）:**
- 「共有サーバー（推奨）」と「自分のサーバー」の二択カードUI
- 共有サーバー選択時も接続テストを実行
- 接続失敗時は「接続できません。続行しますか？」を表示
- URLはUIに一切表示しない

**Settings（`src/modules/account/pages/Settings.tsx`）:**
- `エンドポイント: {API_BASE}` → 「共有サーバー」/「カスタムサーバー」ラベル表示
- カスタムサーバーURL入力・接続テスト機能は維持

### 4. 情報露出防止

| 対策 | ファイル | 変更 |
|------|---------|------|
| Workerエラーメッセージ隠蔽 | `packages/worker/src/index.ts` | `err.message` → `'Internal server error'` |
| チャットログ制限 | `app/modules/chat/session-manager.ts` | ユーザー入力・AI応答本文を除去、メタデータのみ送信 |
| URLバリデーション強化 | `app/main.ts` IPC handler | `new URL()` パース + credentials付きURL拒否 |
| autoRefreshガード | `app/main.ts` | セットアップ未完了 or URL空文字なら早期return |

### 5. git・ドキュメント整理

- `git rm --cached -r packages/electron/release/` でインデックスから除去
- `.gitignore` に `*.asar` 追加
- `docs/` 5ファイルで `nohara-ce` → `YOUR_USERNAME` に置換

## 修正ファイル一覧

| # | ファイル | 種別 |
|---|---------|------|
| 1 | `app/modules/config/shared-server.ts` | 新規 |
| 2 | `src/config.ts` | 修正 |
| 3 | `app/modules/config/app-config-store.ts` | 修正 |
| 4 | `app/main.ts` | 修正 |
| 5 | `app/preload.ts` | 修正 |
| 6 | `src/modules/setup/SetupWizard.tsx` | 修正 |
| 7 | `src/modules/account/pages/Settings.tsx` | 修正 |
| 8 | `packages/worker/src/index.ts` | 修正 |
| 9 | `app/modules/chat/session-manager.ts` | 修正 |
| 10 | `docs/agent-setup-guide.md` | 修正 |
| 11 | `docs/setup-guide.md` | 修正 |
| 12 | `docs/setup-slides.md` | 修正 |
| 13 | `docs/cloudflare_setup.md` | 修正 |
| 14 | `docs/self-hosted-setup.html` | 修正 |
| 15 | `.gitignore` | 修正 |

（`packages/electron/` 配下のパスは省略表記）

## 検証結果

| テスト | 結果 |
|--------|------|
| electron-vite build（main/preload/renderer） | PASS |
| worker tsc --noEmit | PASS |
| Rendererバンドルに `nohara-ce` なし | PASS |
| ソース全体で `nohara-ce` は `shared-server.ts` のみ | PASS |
| git indexに release/ なし | PASS |
| PRODUCTION_API 除去確認 | PASS |
| DEFAULT_URL 除去確認 | PASS |
| Worker err.message 除去確認 | PASS |
| チャットログからメッセージ本文除去確認 | PASS |
| SetupWizard にURL非表示確認 | PASS |
| Settings にAPI_BASE非表示確認 | PASS |

## 未対応（別タスク）

| 項目 | 理由 |
|------|------|
| 認証強化（X-License-Id必須化） | アーキテクチャ変更が大きく、全fetch箇所（20+）の修正が必要 |
| CORS制限（`origin: '*'` → 制限） | 開発との兼ね合い |
| シークレットローテーション | Meta Developer Portal での手動操作が必要 |
| git履歴の掃除 | `git filter-repo` + force push が必要。別途実施 |
| asar内Main processバンドルからのURL完全除去 | リモート設定サーバーが必要。現段階ではスコープ外 |
