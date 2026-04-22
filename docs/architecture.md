# Urads 全体設計書

## 1. 設計方針

| 方針 | 説明 |
|------|------|
| **フィーチャーモジュラー** | 機能ドメイン単位で自己完結。routes / DB / UI / types を1モジュールに集約 |
| **サーバーレス中心** | 常時稼働はCloudflare Workers。ローカルはUIとスクレイピングのみ |
| **TS統一** | Electron / React / Workers / Playwright 全てTypeScript |
| **ステートレスクライアント** | ローカルに永続データを持たない。全てD1/R2に同期 |
| **フェーズ拡張可能** | 新モジュール追加 = フォルダ作成 + import 1行。既存コード変更なし |
| **アカウント完全分離** | 全データが account_id or license_id で紐づく |

---

## 2. フィーチャーモジュール一覧

### 2.1 モジュール定義

| モジュール | Phase | 責務 | DB テーブル |
|-----------|-------|------|-------------|
| **auth** | 1 (Core) | ライセンス検証・デバイス管理 | `licenses`, `app_users` |
| **account** | 1 (Core) | Threads OAuth・アカウントCRUD・UI状態保存/復元 | `accounts`, `account_states` |
| **post** | 1 (Core) | 投稿作成・予約・履歴・Cron実行・メディア管理 | `posts` |
| **update** | 1 (Core) | 自動更新チェック・R2署名付きURL発行 | — |
| **reply** | 2 | リプライルール・キーワード/ランダムエンジン・Webhook | `reply_rules`, `reply_logs`, `rule_templates` |
| **research** | 3 | ベンチマーク・Playwrightスクレイピング・バズ検知・分析 | `benchmarks`, `scraped_posts`, `analysis_results`, `scrape_schedules` |
| **editor** | 4 | Fabric.jsテンプレ・AI画像生成・Remotion動画・アセット管理 | `ai_generations`, `templates` |

### 2.2 モジュール境界ルール

- モジュール間で直接 import しない。共有データは `@urads/shared` の型契約を介する
- モジュール内は `routes → service → repository` のレイヤーで構成
- 各モジュールは `module.ts` でルート・Cron・Webhook・サイドバー項目を宣言し、中央レジストリに登録

### 2.3 モジュール依存関係

```
auth ← account ← post
                ← reply (Phase 2)
                ← research (Phase 3)
                ← editor (Phase 4)

update（独立・auth のみ参照）
```

- `auth` は全モジュールの前提（ライセンス検証）
- `account` は投稿系モジュールの前提（アカウントID）
- Phase モジュールは Core に依存するが、Phase 間の依存はなし

---

## 3. ディレクトリ構成

```
Urads/
├── package.json                     # ルート（pnpm workspace）
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/
│   ├── shared/                      # @urads/shared ── 型契約・共通定義
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── types.ts         # LicenseStatus, LicenseKey, AppUser
│   │   │   │   └── api-contract.ts  # POST /license/verify 等のReq/Res型
│   │   │   ├── account/
│   │   │   │   ├── types.ts         # Account, AccountUIState, OAuthTokenPair
│   │   │   │   └── api-contract.ts
│   │   │   ├── post/
│   │   │   │   ├── types.ts         # Post, PostStatus, MediaType, Schedule
│   │   │   │   └── api-contract.ts
│   │   │   ├── update/
│   │   │   │   └── types.ts         # UpdateInfo
│   │   │   ├── reply/
│   │   │   │   ├── types.ts         # ReplyRule, ReplyLog, RuleTemplate
│   │   │   │   └── api-contract.ts
│   │   │   ├── research/
│   │   │   │   ├── types.ts         # Benchmark, ScrapedPost, AnalysisResult
│   │   │   │   └── api-contract.ts
│   │   │   └── editor/
│   │   │       ├── types.ts         # Template, AiGeneration
│   │   │       └── api-contract.ts
│   │   └── infrastructure/
│   │       ├── errors.ts            # AppError, ErrorCode enum
│   │       └── feature-registry.ts  # FeatureModuleBase interface
│   │
│   ├── electron/                    # @urads/electron ── デスクトップアプリ
│   │   ├── package.json
│   │   ├── electron-builder.yml
│   │   ├── tsconfig.json
│   │   │
│   │   ├── app/                     # ── Main Process ──
│   │   │   ├── main.ts             # アプリ起動・ウィンドウ管理・モジュール登録
│   │   │   ├── preload.ts          # contextBridge（モジュールIPCを公開）
│   │   │   ├── infrastructure/
│   │   │   │   ├── ipc-registry.ts  # 全モジュールのIPCハンドラを収集・登録
│   │   │   │   ├── module-loader.ts # Core=常時, Phase=フラグで条件ロード
│   │   │   │   └── feature-flags.ts # ライセンスtier → 有効Phase判定
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       │   └── ipc-handlers.ts   # license.verify, license.getStatus
│   │   │       ├── update/
│   │   │       │   └── ipc-handlers.ts   # app.checkUpdate, app.quitAndInstall
│   │   │       ├── research/             # Phase 3
│   │   │       │   ├── ipc-handlers.ts   # scraper.runNow, scraper.setSchedule
│   │   │       │   ├── collector.ts      # Playwright スクレイピング実行
│   │   │       │   ├── scheduler.ts      # ローカルCron（1日2回）
│   │   │       │   └── analyzer.ts       # バズ判定・トレンドスコアリング
│   │   │       └── editor/               # Phase 4
│   │   │           └── ipc-handlers.ts   # fs.selectFolder, fs.listAssets
│   │   │
│   │   └── src/                     # ── Renderer Process (React) ──
│   │       ├── main.tsx             # エントリーポイント
│   │       ├── App.tsx              # モジュールレジストリ → 動的ルート構築
│   │       │
│   │       ├── infrastructure/
│   │       │   ├── api-client.ts    # HTTPクライアント（X-License-Key自動付与）
│   │       │   ├── router-registry.ts    # モジュールからRoute定義を収集
│   │       │   ├── sidebar-registry.ts   # モジュールからサイドバー項目を収集
│   │       │   ├── feature-gate.tsx      # <FeatureGate phase={N}> ラッパー
│   │       │   └── error-boundary.tsx    # グローバルエラーUI
│   │       │
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   │   ├── pages/
│   │       │   │   │   └── LicenseInput.tsx
│   │       │   │   ├── api.ts
│   │       │   │   ├── hooks.ts          # useLicense()
│   │       │   │   └── module.ts         # RendererModule 宣言
│   │       │   ├── account/
│   │       │   │   ├── pages/
│   │       │   │   │   └── AccountSettings.tsx
│   │       │   │   ├── components/
│   │       │   │   │   └── AccountSwitcher.tsx
│   │       │   │   ├── api.ts
│   │       │   │   ├── hooks.ts          # useAccount(), useAccountSwitch()
│   │       │   │   ├── store.ts          # Zustand — 現在アカウント状態
│   │       │   │   └── module.ts
│   │       │   ├── post/
│   │       │   │   ├── pages/
│   │       │   │   │   ├── PostCompose.tsx
│   │       │   │   │   ├── Schedules.tsx
│   │       │   │   │   └── History.tsx
│   │       │   │   ├── components/
│   │       │   │   │   ├── MediaUploader.tsx
│   │       │   │   │   └── PostPreview.tsx
│   │       │   │   ├── api.ts
│   │       │   │   ├── hooks.ts
│   │       │   │   └── module.ts
│   │       │   ├── update/
│   │       │   │   ├── components/
│   │       │   │   │   └── UpdateBanner.tsx
│   │       │   │   └── module.ts
│   │       │   ├── reply/                # Phase 2
│   │       │   │   ├── pages/
│   │       │   │   │   ├── ReplyRules.tsx
│   │       │   │   │   └── ReplyLogs.tsx
│   │       │   │   ├── api.ts
│   │       │   │   ├── hooks.ts
│   │       │   │   └── module.ts
│   │       │   ├── research/             # Phase 3
│   │       │   │   ├── pages/
│   │       │   │   │   ├── Research.tsx
│   │       │   │   │   └── Dashboard.tsx
│   │       │   │   ├── api.ts
│   │       │   │   ├── hooks.ts
│   │       │   │   └── module.ts
│   │       │   └── editor/               # Phase 4
│   │       │       ├── pages/
│   │       │       │   └── ImageEditor.tsx
│   │       │       ├── components/
│   │       │       │   ├── FabricCanvas.tsx
│   │       │       │   ├── AssetPanel.tsx
│   │       │       │   └── AiGenerateDialog.tsx
│   │       │       ├── api.ts
│   │       │       ├── hooks.ts
│   │       │       └── module.ts
│   │       │
│   │       ├── layout/
│   │       │   ├── AppShell.tsx          # サイドバー + コンテンツ領域
│   │       │   └── Sidebar.tsx           # レジストリから動的レンダリング
│   │       │
│   │       └── styles/
│   │
│   └── worker/                      # @urads/worker ── Cloudflare Workers
│       ├── package.json
│       ├── wrangler.toml
│       ├── tsconfig.json
│       │
│       ├── src/
│       │   ├── index.ts             # Hono app ブートストラップ + モジュール登録
│       │   │
│       │   ├── infrastructure/
│       │   │   ├── app.ts           # createApp() — Honoインスタンス + グローバルミドルウェア
│       │   │   ├── middleware/
│       │   │   │   ├── cors.ts
│       │   │   │   ├── license-auth.ts   # X-License-Key 検証
│       │   │   │   ├── account-auth.ts   # account_id 権限確認
│       │   │   │   ├── phase-gate.ts     # requirePhase(N) → 403
│       │   │   │   └── error-handler.ts  # グローバルエラーキャッチ
│       │   │   ├── db.ts            # D1ヘルパー（getDb, transaction）
│       │   │   ├── r2.ts            # R2ヘルパー（upload, signedUrl）
│       │   │   ├── crypto.ts        # AES-256-GCM（トークン暗号化/復号）
│       │   │   └── retry.ts         # 指数バックオフ（Threads API用）
│       │   │
│       │   └── modules/
│       │       ├── auth/
│       │       │   ├── routes.ts         # POST /license/verify, GET /license/status
│       │       │   ├── service.ts        # ライセンスキー生成・検証ロジック
│       │       │   ├── repository.ts     # D1: licenses, app_users
│       │       │   └── module.ts         # WorkerModule 宣言
│       │       ├── account/
│       │       │   ├── routes.ts         # POST /auth/callback, GET/POST/DELETE /accounts/*
│       │       │   ├── service.ts        # OAuthフロー・トークンリフレッシュ・状態管理
│       │       │   ├── repository.ts     # D1: accounts, account_states
│       │       │   └── module.ts
│       │       ├── post/
│       │       │   ├── routes.ts         # /posts/*, /schedules/*, /media/*
│       │       │   ├── service.ts        # 投稿作成・予約実行・メディアアップロード
│       │       │   ├── repository.ts     # D1: posts
│       │       │   ├── cron.ts           # 毎分: 期限到達した予約を投稿実行
│       │       │   └── module.ts
│       │       ├── update/
│       │       │   ├── routes.ts         # GET /update/check, GET /update/download
│       │       │   ├── service.ts        # バージョン比較・R2署名URL発行
│       │       │   └── module.ts
│       │       ├── reply/                # Phase 2
│       │       │   ├── routes.ts         # /replies/*, /rule-templates/*
│       │       │   ├── service.ts        # ルール評価エンジン（keyword/random）
│       │       │   ├── repository.ts     # D1: reply_rules, reply_logs, rule_templates
│       │       │   ├── webhook.ts        # Threads Webhook → リプライ検知・自動返信
│       │       │   └── module.ts
│       │       ├── research/             # Phase 3
│       │       │   ├── routes.ts         # /benchmarks/*, /analysis/*
│       │       │   ├── service.ts        # バズ判定・トレンド分析
│       │       │   ├── repository.ts     # D1: benchmarks, scraped_posts, analysis_results
│       │       │   └── module.ts
│       │       └── editor/               # Phase 4
│       │           ├── routes.ts         # /templates/*, /ai-generate/*
│       │           ├── service.ts        # AI API呼び出し・テンプレメタ管理
│       │           ├── repository.ts     # D1: ai_generations, templates
│       │           └── module.ts
│       │
│       └── migrations/
│           ├── core/                     # 常に実行
│           │   ├── 0001_licenses.sql     # licenses + app_users
│           │   ├── 0002_accounts.sql     # accounts + account_states
│           │   └── 0003_posts.sql        # posts + indexes
│           ├── reply/                    # Phase 2
│           │   └── 0001_reply_rules.sql  # reply_rules + reply_logs + rule_templates
│           ├── research/                 # Phase 3
│           │   └── 0001_benchmarks.sql   # benchmarks + scraped_posts + analysis_results + scrape_schedules
│           └── editor/                   # Phase 4
│               └── 0001_templates.sql    # ai_generations + templates
```

---

## 4. モジュール登録パターン

### 4.1 共通インターフェース（@urads/shared）

```typescript
// packages/shared/infrastructure/feature-registry.ts

export interface FeatureModuleBase {
    id: string;       // 'auth', 'post', 'reply', etc.
    phase: number;    // 1 = Core（常時有効）, 2/3/4 = 条件付き
}
```

### 4.2 Worker モジュール

```typescript
// packages/worker/src/infrastructure/route-registry.ts

import type { Hono } from 'hono';
import type { FeatureModuleBase } from '@urads/shared';

export type CronHandler = (env: Env) => Promise<void>;
export type WebhookHandler = {
    path: string;
    handler: (c: Context) => Promise<Response>;
};

export interface WorkerModule extends FeatureModuleBase {
    routes?: (app: Hono) => void;       // Honoにルートグループをマウント
    cronJobs?: CronHandler[];           // Cron tick で呼ばれるハンドラ
    webhooks?: WebhookHandler[];        // Webhook エンドポイント
}
```

**index.ts — ブートストラップ:**

```typescript
// packages/worker/src/index.ts

import { createApp } from './infrastructure/app';
// Core modules
import { authModule } from './modules/auth/module';
import { accountModule } from './modules/account/module';
import { postModule } from './modules/post/module';
import { updateModule } from './modules/update/module';
// Phase modules
import { replyModule } from './modules/reply/module';
import { researchModule } from './modules/research/module';
import { editorModule } from './modules/editor/module';

const modules: WorkerModule[] = [
    authModule, accountModule, postModule, updateModule,
    replyModule, researchModule, editorModule,
];

const app = createApp();

// 全モジュールのルートを登録
for (const mod of modules) {
    mod.routes?.(app);
}

export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        for (const mod of modules) {
            for (const job of mod.cronJobs ?? []) {
                ctx.waitUntil(job(env));
            }
        }
    },
};
```

### 4.3 Renderer モジュール

```typescript
// packages/electron/src/infrastructure/router-registry.ts

import type { LazyExoticComponent, ComponentType } from 'react';
import type { FeatureModuleBase } from '@urads/shared';

export interface RouteDefinition {
    path: string;
    component: LazyExoticComponent<ComponentType>;
}

export interface SidebarItem {
    label: string;
    icon: string;
    path: string;
    order: number;    // 表示順（10, 20, 30...）
}

export interface RendererModule extends FeatureModuleBase {
    routes: RouteDefinition[];
    sidebarItems: SidebarItem[];
}
```

**module.ts の実装例（post モジュール）:**

```typescript
// packages/electron/src/modules/post/module.ts

import { lazy } from 'react';
import type { RendererModule } from '../../infrastructure/router-registry';

export const postModule: RendererModule = {
    id: 'post',
    phase: 1,
    routes: [
        { path: '/compose',   component: lazy(() => import('./pages/PostCompose')) },
        { path: '/schedules', component: lazy(() => import('./pages/Schedules')) },
        { path: '/history',   component: lazy(() => import('./pages/History')) },
    ],
    sidebarItems: [
        { label: '新規投稿', icon: 'PenSquare', path: '/compose',   order: 10 },
        { label: '予約一覧', icon: 'Calendar',  path: '/schedules', order: 20 },
        { label: '投稿履歴', icon: 'History',   path: '/history',   order: 30 },
    ],
};
```

**App.tsx — 動的ルート構築:**

```typescript
// packages/electron/src/App.tsx

import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useFeatureFlags } from './infrastructure/feature-gate';
import { AppShell } from './layout/AppShell';
import { Sidebar } from './layout/Sidebar';

// 全モジュールimport
import { authModule } from './modules/auth/module';
import { accountModule } from './modules/account/module';
import { postModule } from './modules/post/module';
import { updateModule } from './modules/update/module';
import { replyModule } from './modules/reply/module';
import { researchModule } from './modules/research/module';
import { editorModule } from './modules/editor/module';

const allModules = [
    authModule, accountModule, postModule, updateModule,
    replyModule, researchModule, editorModule,
];

export function App() {
    const enabledPhases = useFeatureFlags();

    const activeModules = allModules.filter(m => enabledPhases.includes(m.phase));
    const routes = activeModules.flatMap(m => m.routes);
    const sidebarItems = activeModules
        .flatMap(m => m.sidebarItems)
        .sort((a, b) => a.order - b.order);

    return (
        <AppShell sidebar={<Sidebar items={sidebarItems} />}>
            <Suspense fallback={<div>Loading...</div>}>
                <Routes>
                    {routes.map(r => (
                        <Route key={r.path} path={r.path} element={<r.component />} />
                    ))}
                </Routes>
            </Suspense>
        </AppShell>
    );
}
```

### 4.4 Main Process モジュール（IPC）

```typescript
// packages/electron/app/infrastructure/ipc-registry.ts

import type { FeatureModuleBase } from '@urads/shared';

export interface MainModule extends FeatureModuleBase {
    registerIPC: (ipcMain: Electron.IpcMain) => void;
}
```

**main.ts で登録:**

```typescript
import { authMainModule } from './modules/auth/ipc-handlers';
import { updateMainModule } from './modules/update/ipc-handlers';
// Phase modules
import { researchMainModule } from './modules/research/ipc-handlers';

const mainModules: MainModule[] = [
    authMainModule, updateMainModule,
    ...(enabledPhases.includes(3) ? [researchMainModule] : []),
];

for (const mod of mainModules) {
    mod.registerIPC(ipcMain);
}
```

---

## 5. フィーチャーフラグ

### 5.1 Plan → Phase マッピング

```typescript
const PLAN_PHASES: Record<string, number[]> = {
    standard:   [1],
    pro:        [1, 2],
    enterprise: [1, 2, 3, 4],
};
```

### 5.2 各レイヤーでの適用

| レイヤー | 仕組み | 動作 |
|---------|--------|------|
| **Workers** | `requirePhase(N)` ミドルウェア | `license.plan` を判定 → 未対応Phaseなら 403 `upgrade_required` |
| **Renderer** | `useFeatureFlags()` hook | Plan→Phases変換 → モジュールフィルタ → ルート/サイドバー動的生成 |
| **Main Process** | `feature-flags.ts` | ライセンス情報からPhase判定 → IPC/Playwrightの条件分岐 |

### 5.3 Worker Phase ゲートミドルウェア

```typescript
// packages/worker/src/infrastructure/middleware/phase-gate.ts

export function requirePhase(phase: number) {
    return async (c: Context, next: Next) => {
        const license = c.get('license');  // license-auth middleware がセット
        const enabled = PLAN_PHASES[license.plan] ?? [1];
        if (!enabled.includes(phase)) {
            return c.json({ error: 'upgrade_required', required_phase: phase }, 403);
        }
        await next();
    };
}
```

### 5.4 Renderer フィーチャーゲート

```typescript
// packages/electron/src/infrastructure/feature-gate.tsx

export function useFeatureFlags(): number[] {
    const { license } = useLicense();
    return PLAN_PHASES[license?.plan ?? 'standard'] ?? [1];
}

export function FeatureGate({ phase, children }: { phase: number; children: ReactNode }) {
    const phases = useFeatureFlags();
    if (!phases.includes(phase)) return null;
    return <>{children}</>;
}
```

---

## 6. DBマイグレーション

### 6.1 方針

**全マイグレーションを常に実行する。** 空テーブルはD1（SQLite）でコスト0。Phase判定なしで運用をシンプルに保つ。

### 6.2 構成

```
migrations/
├── core/
│   ├── 0001_licenses.sql        # licenses + app_users
│   ├── 0002_accounts.sql        # accounts + account_states
│   └── 0003_posts.sql           # posts + indexes
├── reply/
│   └── 0001_reply_rules.sql     # reply_rules + reply_logs + rule_templates
├── research/
│   └── 0001_benchmarks.sql      # benchmarks + scraped_posts + analysis_results + scrape_schedules
└── editor/
    └── 0001_templates.sql       # ai_generations + templates
```

### 6.3 実行順序

`_migration_log` テーブルで適用済みを管理:

```sql
CREATE TABLE IF NOT EXISTS _migration_log (
    module    TEXT NOT NULL,
    filename  TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    PRIMARY KEY (module, filename)
);
```

実行順: `core` → `reply` → `research` → `editor`（各モジュール内は番号順）

```bash
pnpm --filter worker db:migrate    # 全モジュールの未適用マイグレーションを実行
```

---

## 7. クロスカッティング（infrastructure 層）

モジュール横断の関心事は `infrastructure/` に配置。モジュールからは利用されるが、モジュール内には入れない。

### 7.1 一覧

| 関心事 | Worker | Electron Main | Renderer |
|--------|--------|---------------|----------|
| **認証** | `middleware/license-auth.ts` `middleware/account-auth.ts` | `feature-flags.ts` | `api-client.ts`（ヘッダー自動付与） |
| **エラー** | `middleware/error-handler.ts` | — | `error-boundary.tsx` |
| **ログ** | Workers Analytics | `electron-log` | Console |
| **暗号化** | `crypto.ts`（AES-256-GCM） | — | — |
| **リトライ** | `retry.ts`（指数バックオフ） | — | `api-client.ts`（ネットワークリトライ） |
| **CORS** | `middleware/cors.ts` | — | — |
| **Phase制御** | `middleware/phase-gate.ts` | `feature-flags.ts` | `feature-gate.tsx` |

### 7.2 認証フロー

```
アプリ → Workers 間:
  全リクエストに以下のヘッダーを付与:
    X-License-Key: URADS-XXXXX-XXXXX-XXXXX-XXXXX
    X-Device-Id: (端末固有ID)

  Workers license-auth ミドルウェア:
    1. ライセンスキーがD1に存在 & status='active'
    2. expires_at チェック
    3. デバイスIDの記録（不正共有検知用）
    4. c.set('license', licenseObj) で後続に渡す

Workers → Threads API 間:
    OAuthトークンをD1から取得 → AES-256-GCM で復号 → Bearer token送信
```

### 7.3 エラーハンドリング分類

| カテゴリ | 例 | 対応 |
|---------|-----|------|
| 認証エラー | ライセンス無効・トークン期限切れ | ブロック画面 or 再認証フロー |
| APIエラー | Threads Rate Limit・500エラー | リトライキュー + ユーザー通知 |
| ネットワークエラー | オフライン・タイムアウト | オフラインモード + 再接続時同期 |
| スクレイピングエラー | ページ構造変更・BAN | エラーログ + 手動確認通知 |
| 決済エラー | Stripe支払い失敗 | 猶予期間 → 期限切れ |

### 7.4 リトライ戦略

```
Threads API リクエスト:
  1回目失敗 → 5秒後リトライ
  2回目失敗 → 30秒後リトライ
  3回目失敗 → status='failed' + エラー記録 + アプリ通知

予約投稿の失敗:
  次のCron tick（1分後）で再試行
  3回連続失敗 → status='failed' で打ち切り
```

---

## 8. レイヤー間データフロー

### 8.1 Electron プロセス構成

```
┌─ Main Process ────────────────────────────────────┐
│                                                    │
│  main.ts          アプリ起動・ウィンドウ管理        │
│  module-loader.ts モジュール登録                    │
│  ipc-registry.ts  IPCハンドラ集約                  │
│                                                    │
│  ┌─ Scraper Subprocess（Phase 3）──┐              │
│  │  Playwright をforkして実行       │              │
│  │  メインプロセスをブロックしない    │              │
│  └──────────────────────────────────┘              │
└────────────────────────────────────────────────────┘
        │ IPC (contextBridge)
        ▼
┌─ Renderer Process ────────────────────────────────┐
│                                                    │
│  React App（モジュールレジストリ駆動）              │
│  ├─ layout/     AppShell + Sidebar                │
│  ├─ modules/    各機能モジュールのUI                │
│  └─ infrastructure/  api-client, feature-gate     │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 8.2 IPC API（preload.ts 経由で公開）

```typescript
contextBridge.exposeInMainWorld('urads', {
    // auth モジュール
    license: {
        verify: (key: string) => Promise<LicenseStatus>,
        getStatus: () => Promise<LicenseStatus>,
    },
    // update モジュール
    app: {
        getVersion: () => string,
        checkUpdate: () => Promise<UpdateInfo | null>,
        quitAndInstall: () => void,
    },
    // research モジュール（Phase 3）
    scraper: {
        runNow: () => Promise<ScrapeResult>,
        getSchedule: () => Promise<ScrapeSchedule>,
        setSchedule: (schedule: ScrapeSchedule) => Promise<void>,
    },
    // editor モジュール（Phase 4）
    fs: {
        selectFolder: () => Promise<string | null>,
        listAssets: (folder: string) => Promise<AssetFile[]>,
        readFile: (path: string) => Promise<Buffer>,
    },
});
```

### 8.3 起動シーケンス

```
アプリ起動
  │
  ├─ 1. ライセンス検証（auth モジュール）
  │     ├─ ローカルに暗号化保存されたキーを読む or 入力画面
  │     └─ Workers POST /license/verify で検証
  │        ├─ 有効 → 続行（plan情報でフィーチャーフラグ設定）
  │        └─ 無効 → ライセンス入力画面（ブロック）
  │
  ├─ 2. 自動更新チェック（update モジュール・バックグラウンド）
  │     └─ 新バージョンあり → UpdateBanner 表示
  │
  ├─ 3. アカウント取得（account モジュール）
  │     ├─ アカウントあり → 最後に使用したアカウント選択 + UI状態復元
  │     └─ アカウントなし → OAuth連携画面
  │
  └─ 4. メイン画面表示（有効モジュールのルート + サイドバー）
```

### 8.4 アカウント切替フロー

```typescript
async function switchAccount(targetAccountId: string) {
    // 1. 現在のUI状態を収集
    const currentState = collectUIState();

    // 2. 現在のアカウント状態をサーバーに保存
    await api.accounts.saveState(currentAccountId, currentState);

    // 3. UIを完全クリア（前アカウントのデータが残らない）
    resetAllStores();     // Zustand の全ストアをリセット
    clearQueryCache();    // React Query のキャッシュ全削除

    // 4. ターゲットアカウントの状態を取得
    const savedState = await api.accounts.getState(targetAccountId);

    // 5. アカウント切替（APIクライアントの account_id を更新）
    setCurrentAccount(targetAccountId);

    // 6. UI状態を復元（なければデフォルト画面）
    savedState ? restoreUIState(savedState) : navigateTo('/compose');
}
```

### 8.5 Workers Cron 設計

```toml
# wrangler.toml
[triggers]
crons = ["* * * * *"]    # 毎分実行
```

```
Cron Tick（毎分）
  │
  ├─ post モジュール: 予約投稿チェック
  │     SELECT * FROM posts
  │     WHERE status = 'scheduled' AND scheduled_at <= now()
  │     ORDER BY scheduled_at LIMIT 10
  │     → 各投稿: トークン取得 → 期限切れならrefresh → Threads API投稿 → D1記録
  │
  └─ auth モジュール: ライセンス期限チェック（0:00のtickのみ）
        UPDATE licenses SET status = 'expired'
        WHERE expires_at IS NOT NULL AND expires_at < now()
        AND status = 'active'
```

### 8.6 Webhook 設計

```
Threads Webhook → POST /webhook/threads（reply モジュール）
  ├─ 署名検証（X-Hub-Signature-256）
  ├─ comments イベントのみ処理
  ├─ ルール取得 → 評価（keyword_match / random）
  ├─ reply_once_per_user チェック
  ├─ Threads API で返信
  └─ reply_logs に記録

Stripe Webhook → POST /webhook/stripe（auth モジュール）
  ├─ 署名検証
  ├─ checkout.session.completed → ライセンスキー生成 + D1保存
  ├─ customer.subscription.deleted → ライセンス無効化
  ├─ invoice.payment_failed → ステータス更新
  └─ Discord通知
```

---

## 9. セキュリティ設計

### 9.1 Electron セキュリティ

```
nodeIntegration: false     Renderer から直接 Node.js アクセス禁止
contextIsolation: true     preload と Renderer のコンテキスト分離
sandbox: true
CSP: script-src 'self'
外部URLのナビゲーション禁止
```

### 9.2 トークン暗号化

```
暗号化キー: Workers の環境変数（secret）に保存
アルゴリズム: AES-256-GCM
対象: access_token, refresh_token
D1保存形式: base64(iv + ciphertext + auth_tag)
```

### 9.3 R2 バケット構成

```
urads-media/
├── media/{account_id}/{uuid}.{ext}        # 投稿用メディア
├── thumbnails/{account_id}/{uuid}.jpg     # サムネイル（自動生成）
├── templates/{license_id}/{uuid}.json     # テンプレート（Phase 4）
├── ai-generated/{account_id}/{uuid}.png   # AI生成画像（Phase 4）
└── releases/                              # アプリバイナリ
    ├── latest.yml                         # electron-updater 用
    ├── Urads-{version}-win.exe
    ├── Urads-{version}-mac.dmg
    └── Urads-{version}-linux.AppImage
```

---

## 10. 開発・デプロイ

### 10.1 モノレポ構成

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### 10.2 開発コマンド

```bash
# 依存インストール
pnpm install

# Electron + React 開発（Hot Reload）
pnpm --filter @urads/electron dev

# Workers ローカル開発（Miniflare）
pnpm --filter @urads/worker dev

# 両方同時起動
pnpm dev

# ビルド
pnpm --filter @urads/electron build        # Electronアプリビルド
pnpm --filter @urads/worker deploy         # Workers デプロイ

# DB マイグレーション
pnpm --filter @urads/worker db:migrate          # ローカル D1（開発用）
pnpm --filter @urads/worker db:migrate:remote   # 本番 D1

# テスト
pnpm test                                   # 全パッケージ
pnpm --filter @urads/worker test            # Workers のみ
pnpm --filter @urads/electron test          # Electron のみ
```

### 10.3 環境変数

```toml
# wrangler.toml（Workers）
[vars]
THREADS_APP_ID = "xxx"
THREADS_REDIRECT_URI = "https://urads-api.xxx.workers.dev/auth/callback"

# Workers secrets（wrangler secret put）
# THREADS_APP_SECRET
# STRIPE_SECRET_KEY
# STRIPE_WEBHOOK_SECRET
# TOKEN_ENCRYPTION_KEY
# DISCORD_WEBHOOK_URL
```

```env
# Electron（.env）
VITE_API_BASE_URL=https://urads-api.xxx.workers.dev
```

### 10.4 デプロイフロー

```
1. バージョン更新:  pnpm --filter @urads/electron version patch/minor/major
2. Workers デプロイ: pnpm --filter @urads/worker deploy
3. D1 マイグレーション: pnpm --filter @urads/worker db:migrate:remote
4. Electron ビルド: pnpm --filter @urads/electron build
5. R2 アップロード: pnpm --filter @urads/electron release
6. Discord 通知: 「v1.x.x リリースしました」
```

---

## 11. 新モジュール追加ガイド

仮に「Phase 5: エクスポート機能」を追加する場合:

### Step 1: 型定義（shared）

```
packages/shared/modules/export/
├── types.ts          # ExportConfig, ExportResult
└── api-contract.ts   # POST /exports のReq/Res型
```

### Step 2: Worker モジュール

```
packages/worker/src/modules/export/
├── routes.ts         # POST /exports, GET /exports/:id
├── service.ts        # エクスポート実行ロジック
├── repository.ts     # D1クエリ
└── module.ts         # WorkerModule 宣言

packages/worker/migrations/export/
└── 0001_exports.sql  # exports テーブル
```

`index.ts` に1行追加:
```typescript
import { exportModule } from './modules/export/module';
// modules 配列に追加
```

### Step 3: Renderer モジュール

```
packages/electron/src/modules/export/
├── pages/Export.tsx
├── api.ts
├── hooks.ts
└── module.ts         # RendererModule 宣言（routes + sidebarItems）
```

`App.tsx` に1行追加:
```typescript
import { exportModule } from './modules/export/module';
// allModules 配列に追加
```

### Step 4: Main Process（IPC が必要な場合のみ）

```
packages/electron/app/modules/export/
└── ipc-handlers.ts   # MainModule 宣言
```

**変更するファイル**: `worker/index.ts` と `electron/App.tsx` に **import 1行ずつのみ**。既存モジュールのファイルは一切変更しない。
