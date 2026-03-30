# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Urads** — Threads（Meta）自動投稿・リサーチツール。投稿管理、予約投稿、リプライ自動化、競合リサーチを提供するデスクトップアプリ。

## Tech Stack

- **Desktop**: Electron + TypeScript（クロスプラットフォーム）
- **Frontend**: React（Electron Renderer）
- **Backend**: Cloudflare Workers（投稿API / Cron予約実行 / Webhook受信）
- **Database**: Cloudflare D1（SQLite互換、複数端末共有）
- **Scraping**: Playwright（Electron内Node.js、ローカルPC起動中のみ）
- **Auto-update**: electron-updater + GitHub Releases

## Architecture

- Electron App = UIクライアント + スクレイピング + 分析（全てTypeScript）
- Cloudflare Workers = 常時稼働サーバー（予約実行・Webhook・D1管理）
- ローカルに永続データを持たない。全てD1に同期。

## Development Phases

- Phase 1: 投稿 + 予約投稿（MVP）
- Phase 2: リプライ自動化
- Phase 3: リサーチ + 分析
- Phase 4: 画像/動画エディタ + AI生成（画像: Stability AI/DALL-E、文章: Claude API/ollama）

## Reference

- `E:/tool/ThreadsAutoTool/` — Python版プロトタイプ（全Phase実装済み）。設計参考用

## Safety Layer（投稿安全対策）

Threads APIでのBAN防止のため、以下の安全制限を実装済み（`packages/worker/src/modules/post/safety.ts`）。

| 対策 | 値 | 根拠 |
|------|-----|------|
| 24時間投稿上限 | **24件** | 10件/時で凍結リスク → 24件/日が安全 |
| 1時間投稿上限 | **6件** | 10件/時で凍結 → 6件で余裕 |
| 最低投稿間隔 | **10分** | 10分2件で凍結リスク |
| 予約ジッター | **5-15分**ランダム遅延 | 同時刻投稿の衝突防止 |
| Cron処理上限 | **1件/回** | 10分ルール絶対厳守 |
| 429エラー | failedにせずリトライ | 次のCronサイクルで |
| リプライ上限 | **50件/時、200件/日** | 50-100アクションで不自然判定 |
| リプライ間隔 | **60秒** | 自動化判定回避 |
| ポーラー処理 | **1件/サイクル** | バースト返信防止 |
| デフォルトcooldown | **60秒** | 5秒は危険 |
| 全アクション/時 | **40件** | 投稿+リプライ+いいね合計 |

**投稿前チェック順序:**
1. 24h投稿数 < 24 か
2. 1h投稿数 < 6 か
3. 前回投稿から10分以上経過しているか
4. Threads API側のクォータ確認

**核心原則: 「どれだけ攻めるか」ではなく「どれだけ自然に見せるか」**

## Key Documents

- `docs/requirements.md` — 要件定義書（全Phase詳細）
- `docs/threads_api_setup.md` — Threads API セットアップ手順
- `docs/threads_safety_guide.md` — BAN防止・安全運用ガイド
- `docs/threads_algorithm.md` — Threadsアルゴリズム分析
- `docs/cloudflare_setup.md` — Cloudflare Workers/D1/R2 セットアップ
- `docs/competitive_analysis.md` — 競合分析（GAS vs Urads）
- `docs/skill_design.md` — AIスキル設計書
- `docs/architecture.md` — 全体設計書
