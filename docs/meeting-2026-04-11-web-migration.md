# Web化検討会議 — 2026-04-11

## 背景

スマホからも操作できるようにしたい。現在はElectronデスクトップアプリのみ。

## 現状の構成

- Electron App = UI + Agent SDKチャット + Playwright + Ollama
- Cloudflare Workers = 投稿API / Cron予約実行 / Webhook
- Cloudflare D1 = 全データ管理
- Cloudflare R2 = メディア

## 棚卸：スマホWeb版で出来ること / 出来ないこと

### PC不要（Workers + D1で完結）

- 投稿作成・編集・削除
- 予約投稿の管理・自動実行（Cron Trigger）
- リプライ自動化の設定・実行
- AI テキスト生成（Workers側 Claude API）
- メディア管理（R2）
- リサーチ結果の閲覧（D1のデータ）
- 設定変更

### PC起動中のみ（ローカル依存）

- AIチャット / スキル（Agent SDK = Claudeサブスクセッション、ローカルのみ）
- Ollama生成（ローカルLLM）
- スクレイピング実行（Playwright）
- Insights取得（スクレイパー経由）

### Web用に別実装が必要

- Threads OAuth認証（現在Electronブラウザウィンドウ経由）

## 設計方針

### バックグラウンド / フロント分離

```
【常時稼働】Cloudflare Workers + D1 + R2
  → 投稿・予約・リプライ・AI生成（Claude API）

【PC起動中のみ】バックグラウンドサービス（Electron or Node.js常駐）
  → Agent SDKチャット / Ollama / スクレイピング / Insights
  → WorkersにハートビートでPC状態を通知
```

### 動作の分岐

```
Web UI → Workers API → PCオンライン？
                        ├─ Yes → PC経由でフル機能
                        └─ No  → Workers単体で出来る範囲
```

Web UIは「PCオフラインのため一部機能が制限されています」と表示。

## Web化のメリット

- UI管理が1つに統一（Electron UI廃止可能）
- ビルド・リリースがPagesだけ（electron-updater不要）
- ユーザーはブラウザだけでOK（インストール不要）
- 常に最新版

## デプロイ / サーバー

- Web UI → Cloudflare Pages（無料）
- API → Cloudflare Workers（既存、無料〜$5/月）
- DB → D1（既存、無料枠）
- メディア → R2（既存、無料枠）
- 追加サーバー不要

## SaaS化（他者への提供）

サービスとして他者にも提供する予定。以下が追加で必要：

- ユーザー登録・認証システム
- マルチテナント設計（データ分離）
- 課金・プラン管理
- 利用量に応じたCloudflare費用の考慮

→ 詳細設計は別途検討

## 用語メモ

- **Agent SDK**: Anthropicの `@anthropic-ai/claude-agent-sdk`。Claudeサブスク（Max等）でチャットセッションを維持する仕組み。APIキーではなくサブスクセッションで動くためローカルPC上でのみ実行可能。

## AI方針

- **AI機能はアプリの中核機能**（投稿分析・競合分析・投稿提案・日次レポート）
- AI処理は**ユーザー自身のClaude サブスク（Agent SDK）で実行**
- サービス側のAI費用: ゼロ（ユーザーの契約で動く）
- ターゲット（AI占い師）は全員すでにAIサブスクを持っている前提

### Claude限定の理由（2026-04-11調査結果）

| サービス | サブスクでSDK利用 |
|---------|:---:|
| Claude (Agent SDK) | ✅ 対応 |
| OpenAI (ChatGPT/Codex) | ❌ APIキー別契約が必要 |
| Gemini | ❌ プログラム利用は非公式 |

- **サブスクのままプログラムから呼べるのはClaudeだけ**
- 他社が将来サブスク対応したら追加を検討
- **代替手段**: 他LLM（OpenAI / Gemini等）はAPIキー入力で対応可能にする
  - Claudeユーザー → 設定不要（サブスクで即使える）
  - 他LLMユーザー → APIキーを入力すれば使える

## ビジネスモデル

- **月額サブスク（SaaS）**: ¥980/月
- **全機能入り**（機能制限プランは設けない）
- AI API費用は1ユーザー月数十円程度なので吸収可能
- 買い切りは不採用（サポート地獄になる）
- プラン分けは不採用（全部入りの方がユーザー体験が良い）
- 将来ユーザー数が伸びたら上位プラン検討の余地あり
- ターゲット: 占い師・スピリチュアル系クリエイター

## 次のステップ

- [ ] SaaS化を含めた全体設計プラン
- [ ] マルチテナント・認証設計
- [ ] Web UI（packages/web）の実装方針
- [ ] PC常駐サービスの設計
