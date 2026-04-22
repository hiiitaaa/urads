# バズ自動リライト機能 設計書

**ステータス**: 設計中（未実装）
**対象Phase**: Phase 3〜4（リサーチ + AI生成）
**最終更新**: 2026-04-20
**シニアレビュー反映**: 済（Critical 3件 + High 4件）

---

## 1. 概要

### 目的

ベンチマークアカウントで発生したバズ投稿を自動検知し、**自分のアカウントの世界観に合わせてリライトした下書き**を生成する。自動投稿はしない（安全レイヤーの原則を維持）。

### スコープ

- ✅ バズ検知 → 要素分解 → 世界観適用 → ガードレール → 下書き保存 → 通知
- ❌ 自動投稿（ユーザーが下書きを確認・編集・予約して初めて投稿される）
- ❌ 画像/動画の自動生成（Phase 4 別機能）

### 核心原則

1. **要素レベルでリライト**（丸パクリではなく、構造抽出 → 自分流に翻訳）
2. **自動投稿は絶対にしない**（下書き生成まで）
3. **ツールは項目スキーマを決めつけない**（世界観の中身はユーザーが決める）
4. **AI評価に頼らない決定的ガードレール**（著作権・パクリ判定は機械的に）
5. **Web移行を見据えた抽象化**（ローカルCLI依存をインタフェースで隠蔽）

---

## 2. アーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────┐
│ Electron App (UI + スクレイピング)                    │
│  ├─ React UI                                         │
│  ├─ Playwright スクレイパ                             │
│  └─ AiExecutor 実装: LocalClaudeCodeExecutor          │
└────────────────────┬────────────────────────────────┘
                     │ HTTP(S)
┌────────────────────▼────────────────────────────────┐
│ Cloudflare Worker                                    │
│  ├─ /research/* （ベンチマーク・スクレイプ受信）        │
│  ├─ /posts/* （投稿・下書き管理）                      │
│  ├─ Cron: バズ判定・ルール発火                        │
│  └─ D1: accounts, posts, scraped_posts, ...          │
└─────────────────────────────────────────────────────┘

将来 Web版（SaaS）:
┌─────────────────────────────────────────────────────┐
│ Browser (React UI)                                   │
│  └─ AiExecutor 実装: RemoteClaudeApiExecutor          │
│      （Anthropic API or サーバ側プロキシ経由）         │
└─────────────────────────────────────────────────────┘
```

### 2.2 AI実行レイヤー抽象化（重要）

Web移行時の地獄を避けるため、**AI実行は最初からインタフェース化**する。

```typescript
// packages/shared/src/ai/executor.ts
interface AiExecutor {
  runSkill(
    skillName: 'buzz-rewrite' | 'persona-brainstorm' | string,
    input: unknown,
    options?: { timeout?: number; signal?: AbortSignal }
  ): Promise<AiResult<T>>;
}

interface AiResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
  usage?: { inputTokens: number; outputTokens: number; estimatedCost: number };
}

// Electron版実装
class LocalClaudeCodeExecutor implements AiExecutor {
  // Claude Code CLI を subprocess で起動
  // ~/.claude/skills/ から SKILL.md を読み込み
  // タイムアウト・SIGTERM・標準エラー解釈を内包
}

// Web版実装（将来）
class RemoteClaudeApiExecutor implements AiExecutor {
  // Anthropic SDK 直叩き
  // SKILL.md相当はWorker側にバンドル
  // BYOK or サーバプロキシで API key を扱う
}
```

**設計判断:**
- `AiExecutor` は **packages/shared** に置く（Electron / Worker / 将来Webから共通参照）
- skill の入出力スキーマは JSON Schema で別ファイル化（`packages/shared/src/ai/skills/*.schema.json`）し、SKILL.md とは分離
- 呼び出し側は skill実装を意識しない（差し替え可能）

### 2.3 データフロー

```
スクレイプ完了
    ↓
Worker: scraped_posts INSERT
    ↓
Worker Cron / Trigger: バズ判定 + 自動リライトルール評価
    ↓ (発火)
Worker → Electron: リライト指示（push or polling）
    ↓
Electron: AiExecutor.runSkill('buzz-rewrite', input)
    ↓
LocalClaudeCodeExecutor: ~/.claude/skills/buzz-rewrite 実行
    ↓
ガードレール（N-gram判定）
    ↓
Electron → Worker: posts INSERT (status='draft', metadata)
    ↓
通知（バッジ + トースト + 任意デスクトップ通知）
```

**Worker → Electron 連絡経路:**
- Phase 1: Electron 起動中のみ。Worker が「保留中リライトタスクキュー」を持ち、Electron が定期 polling
- Phase 2 (Web移行後): すべて Worker内で完結（RemoteClaudeApiExecutor 使用）

---

## 3. バズ判定（D案：時間軸 × アカウント内相対）

### 3.1 パラメータ（仮置き、`research_settings` に格納）

| パラメータ | 仮置き値 | 説明 |
|---|---|---|
| `rewrite_trigger_window_hours` | **48h** | 投稿時刻 (`posted_at`) からの経過時間上限 |
| `rewrite_trigger_multiplier` | **2.0倍** | アカウント内平均 engagement_rate の何倍でトリガー |
| `rewrite_trigger_baseline_days` | **30日** | アカウント内平均の算出期間 |
| `rewrite_trigger_min_posts` | **5件** | 下回ると絶対値判定にフォールバック |

### 3.2 判定フロー

```
IF 同ベンチマークの直近30日投稿数 ≥ 5:
    avg = AVG(engagement_rate) of 直近30日
    is_rewrite_target = (posted_at が48h以内)
                        AND (engagement_rate ≥ avg × 2.0)
ELSE:
    # 絶対値フォールバック（既存 research_settings.buzz_likes/replies/reposts）
    is_rewrite_target = (posted_at が48h以内)
                        AND (likes≥1000 OR replies≥100 OR reposts≥50)

AND NOT EXISTS リライト済み下書き（同 source_scraped_post_id, persona_hash）
AND account_persona.content が空でない
AND 機能がON
```

### 3.3 既存 `is_buzz` との関係

**独立**。`is_buzz` は閾値ラベル、リライトトリガーは新軸の判定。既存ロジックには触らない。

---

## 4. 世界観（account_persona）

### 4.1 設計変更（シニアレビュー反映）

旧設計の `ai_settings.rewrite_persona` は **`account_persona` 専用テーブルに昇格**する。

理由:
- 世界観はリライト以外（投稿提案、リプライ生成）でも使うべき汎用資産
- 1アカウント1レコードで明確に管理
- バージョン管理（hash）と機密性管理がしやすい

### 4.2 スキーマ

```sql
CREATE TABLE account_persona (
  account_id     TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,        -- Markdown
  schema_version INTEGER NOT NULL DEFAULT 1,
  hash           TEXT NOT NULL,        -- SHA-256 of content. 変更検知 / 下書きの世界観バージョン参照に使う
  updated_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_persona_hash ON account_persona(hash);
```

`ai_settings.custom_instructions` は残す（AI機能全般の補助指示として、システムプロンプト寄りの用途）。役割分担:

| カラム | 役割 |
|---|---|
| `account_persona.content` | アカウントの世界観（コンテンツ生成の核、ユーザー作成） |
| `ai_settings.custom_instructions` | AI機能全般の補助指示（管理者寄り、共通の縛り） |

### 4.3 テンプレ雛形（空）

```markdown
# 世界観

## キャラクター【必須】
<!-- 名前／年齢／背景／一言で言うとどんな人？ -->

## 口調・文体【必須】
<!-- 敬語/タメ口、よく使う語尾、絵文字、文の長さ -->

## 専門領域【必須】
<!-- 得意テーマ。他テーマが来た時の差し替え先にもなる -->

## 扱わない領域【必須】
<!-- 専門外テーマ → 専門領域に差し替え or スキップ -->

## NG（絶対やらない）【必須】
<!-- 違反したらリライト中止するハードルール -->

---

## 決めフレーズ【推奨】

## 投稿フォーマット【推奨】

---

## 読者像【任意】

## アカウントの目的【任意】

## 投稿テーマの幅【任意】
```

### 4.4 項目の3層構造

| 層 | 項目 | 理由 |
|---|---|---|
| 🔴 必須 | キャラクター / 口調・文体 / 専門領域 / 扱わない領域 / NG | リライトAIが機能する最低条件 |
| 🟡 推奨 | 決めフレーズ / 投稿フォーマット | アカウントの匂いが出る |
| 🟢 任意 | 読者像 / 目的 / テーマの幅 | 上級者向け、精度微調整 |

### 4.5 プリセット（初期）

- 恋愛タロット占い師
- 西洋占星術師
- 数秘術カウンセラー
- スピリチュアル系カウンセラー

### 4.6 作成方法

1. 手動入力（テンプレにゼロから記入）
2. 「例を挿入」ボタンでプリセット流し込み → 書き換え
3. **`/persona-brainstorm` Claude Code skill** で対話形式に作成 → コピペ
4. 既存チャット機能で壁打ち → 結果をコピペ

ツール側は項目スキーマを強制しない（ユーザーが削る・足すOK）。

### 4.7 フル記入例（恋愛タロット占い師）

```markdown
# 世界観：恋愛タロット占い師「さりな」

## キャラクター
さりな／29歳／元アパレル店員・OLを経て恋愛タロット専門。
悩む女の子の味方。上から目線にならない、決めつけない。

## 口調・文体
- 親しい先輩が話すような敬語まじりのタメ口
- 「〜かも」「〜だよ」「〜してみて」を多用
- 絵文字：🔮💭💕☕️🌙（✨は使いすぎない）
- 「絶対」「必ず」は使わない
- 文は短め、リズムよく

## 専門領域
- 片思い・両思い判定
- 復縁の可能性
- 既婚者恋愛（ジャッジせず寄り添う）
- 結婚運・出会い運
- タロットカードの意味・リーディング

## 扱わない領域
（テーマが来たら専門領域に差し替え）
- 仕事運・転職運 → 恋愛運に差し替え
- 金運 → 結婚運・パートナー運に差し替え
- 家族運 → 恋愛運に差し替え
- 健康・病気 → スキップ（差し替え不可）

## NG（絶対やらない）
- 病気・健康の診断をする
- 他占い師・他スピ系を否定する
- 「今すぐ鑑定申し込み」的な押し売り
- 不安を煽る（「このままだと…」系）
- 「あなたは○○な人」と決めつける

## 決めフレーズ
- 冒頭：「カードが見せてくれたのは…🔮」
- 締め：「今日のあなたが、ちょっとでも軽くなりますように☕️」
- 会話誘導：「コメントで教えて🌙」

## 投稿フォーマット
- 3〜6行
- 1行目でフック（問いかけ or 意外な一言）
- 最後は質問で締めて会話誘発
- ハッシュタグは1個だけ
```

### 4.8 機密性・保存先

- D1 平文保存（Phase 1）
  - SaaS化時にテナント分離 + at-rest 暗号化を検討
- ユーザーには「ここに個人情報・営業秘密を書かないでください」のヒント表示
- 将来オプション: ローカル保存モード（D1には hash のみ送信、本体は端末暗号化保存）

---

## 5. リライト処理

### 5.1 処理フロー

```
[バズ判定で対象検出 → ルール発火]
     ↓
[Phase 1] 要素分解（schema_version付きキャッシュ）
     ↓
[Phase 2] 適用判定（テーマ差し替え / NG判定）
     ↓
[Phase 3] 60点ドラフト 2〜3案
     ↓
[Phase 4] AI自己評価（柔らかい品質チェック）
     ↓
[Phase 4.5] 決定的ガードレール（N-gram判定）★著作権防波堤
     ↓
[Phase 5] 100点改善
     ↓
[下書き保存（冪等性チェック）+ 通知]
```

### 5.2 Phase 1: 要素分解（キャッシュ + スキーマバージョン管理）

**抽出する要素:**

```json
{
  "schema_version": 1,
  "format": "リスト型|ストーリー型|問いかけ型|宣言型|TIPS型|比較型|予測型|告白型",
  "hook": "1行目の引き込み方（例: 意外な数字の提示）",
  "core_message": "主張を1文で",
  "structure": "構造パターン（例: フック→根拠×3→CTA）",
  "theme": {
    "specific": "仕事運",
    "abstract": "運気アップ"
  },
  "cta": "なし|リプ|保存|DM|フォロー",
  "emotion_trigger": "共感|驚き|好奇心|希望|不安|怒り",
  "tone": "断定|相談|柔らかい|厳しい",
  "length": 287
}
```

**キャッシュ戦略:**

```sql
-- analysis_results を流用
-- type='post_elements'
-- data には JSON、必ず schema_version 含む
-- キャッシュキー: (scraped_post_id, schema_version)
```

- スキーマ変更時（`schema_version` を増やす）→ 古いキャッシュは自動的に無効（クエリ時に最新版のみ取得）
- 古いキャッシュは Cron で 90日後に物理削除

**他スキルとの相互利用:**
競合分析スキルなど、別の文脈でも同じキャッシュを参照可能。

### 5.3 Phase 2: 適用判定

```
入力: 要素JSON + account_persona.content
処理:
  1. theme.abstract を世界観「扱わない領域」と照合
     └ マッチ → 専門領域から類似テーマを選択 → target_theme に置換
  2. core_message が NG条項に該当 → proceed=false で中止
  3. NGワードは言い換え候補リストを生成
出力: { proceed, theme_remapped, original_theme, target_theme, ng_flags }
```

### 5.4 Phase 3-4: 生成 + AI自己評価

**60点ドラフト（2〜3案、切り口を変える）:**
- 案A: 構造そのまま・テーマだけ差し替え
- 案B: 構造を世界観の「投稿フォーマット」に合わせて再構成
- 案C: 決めフレーズで包んだストーリー調

**AI自己評価チェックリスト:**
- 世界観のキャラ・口調と一致しているか
- 決めフレーズ・絵文字ルールを守れているか
- NGに抵触していないか
- Threads特性（500字、会話型、1ハッシュタグ）
- 冒頭1行目に引き込みがあるか
- CTAは世界観と合っているか

### 5.5 Phase 4.5: 決定的ガードレール（NEW・最重要）

AI自己評価は信用できない（adversarial や hallucination に脆い）。**機械的判定を最終防衛線とする。**

```typescript
function checkGuardrails(
  original: string,
  rewritten: string,
  settings: GuardrailSettings,
): GuardrailResult {
  return {
    // N-gram連続一致（5-gram以上）
    maxNgramOverlap: countConsecutiveNgramOverlap(original, rewritten, 5),
    // 全体トークン一致率
    tokenOverlapRatio: tokenJaccard(original, rewritten),
    // 直接禁止フレーズ（NGワード辞書）
    bannedPhrases: detectBannedPhrases(rewritten, settings.bannedPhraseList),
    // 文字数（Threadsの500字制約）
    lengthOk: rewritten.length <= 500,
    pass: false, // 判定結果
  };
}
```

**失格条件（OR、いずれか1つでも当たれば失格）:**

| 条件 | デフォルト閾値 | 設定キー |
|---|---|---|
| 5-gram連続一致が3箇所以上 | 3 | `guardrail_max_ngram_hits` |
| 全体トークン一致率 | 0.6（60%）超え | `guardrail_max_token_overlap` |
| NGフレーズ含有 | 1個でもあれば | `guardrail_banned_phrases` (JSON配列) |
| Threads字数超過 | 500字超 | (固定) |

**失格時の挙動:**
1. 即時に再生成（同案を改善依頼） — 最大3回
2. 3回失格 → 該当案を捨てる
3. すべての案が失格 → 下書き保存せずスキップ + ログ
4. 一部の案だけ失格 → 通った案だけ保存

### 5.6 Phase 5: 100点改善

ガードレール通過した案について、AI自己評価結果も加味して最終調整。
AI推しの1案に `is_default: true` を付与。

### 5.7 下書きレコード構造

```typescript
{
  id: "post_xxx",
  account_id: "acc_xxx",
  status: "draft",
  content: "採用案（is_default=trueの本文、ユーザーが切替・編集すると更新）",
  source_scraped_post_id: "sp_xxx",
  rewrite_metadata: {
    benchmark_handle: "@foo",
    original_preview: "元投稿冒頭80字...",
    variants: [
      {
        content: "案A本文",
        reasoning: "採用判断ポイント",
        is_default: true,
        self_eval: { plagiarism_score: 2, tone_match: "high" },
        guardrail: {
          ngram_hits: 1,
          token_overlap: 0.42,
          banned_phrases: [],
          passed: true
        }
      }
      // ... 案B, 案C
    ],
    persona_hash: "sha256:...",         // 生成時の世界観バージョン
    persona_schema_version: 1,
    element_analysis_id: "ar_xxx",
    theme_remapped: true,
    original_theme: "仕事運アップ",
    target_theme: "恋愛運アップ",
    generated_at: 1234567890,
    cost_estimate: { input_tokens: 1200, output_tokens: 800, usd: 0.024 }
  }
}
```

### 5.8 失敗時の挙動・冪等性

**冪等性保証:**

```sql
-- posts に部分UNIQUE制約
CREATE UNIQUE INDEX uniq_post_rewrite_source
ON posts (source_scraped_post_id, json_extract(rewrite_metadata, '$.persona_hash'))
WHERE source_scraped_post_id IS NOT NULL;
```

→ 同じ (元投稿, 世界観バージョン) の組み合わせは1つしか作れない。並列発火しても安全。

**リトライ・タイムアウト:**

| 失敗種別 | 対応 |
|---|---|
| Claude Code CLI タイムアウト（90秒） | 24h後に再試行、累積3回失敗で `skip_until_manual` フラグ |
| API rate limit (429) | 指数バックオフ（30s, 2min, 10min）、それでも失敗なら24h後 |
| ガードレール失格 | Phase 4.5の通り、案ごとに最大3回再生成 |
| パースエラー（JSON崩れ） | 1回だけリトライ、失敗ならスキップ |
| ネットワーク切断 | 即座に再試行（最大3回）、ダメなら24h後 |

**失敗回数の記録:**

```sql
CREATE TABLE rewrite_attempts (
  scraped_post_id TEXT NOT NULL,
  persona_hash    TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  last_attempted_at INTEGER,
  skip_until_manual INTEGER DEFAULT 0,  -- 1なら手動再実行のみ
  PRIMARY KEY (scraped_post_id, persona_hash)
);
```

### 5.9 エッジケース

| ケース | 扱い |
|---|---|
| 画像/動画付き投稿 | テキストのみリライト。「元投稿はメディア付き」メタ付与。画像生成はPhase 4 |
| 短すぎる投稿（<50字） | スキップ（要素分解精度が出ない） |
| スレッド（連投） | **1投稿目のみ対象**（当面の妥協、将来拡張） |
| 同一ベンチマーク連続バズ | 後述「6.3 生成頻度制限」のレート制限で制御 |
| 生成失敗 | 5.8の通り |

---

## 6. 運用方針

### 6.1 全案保存・推し1案フォーカス

- 全案を `rewrite_metadata.variants` に保存（運用者の比較・部分流用に有用）
- UI上は **AI推し1案を大きく表示**、他案はアコーディオンで折りたたみ（デフォルト閉）
- ユーザー設定で「常に全案展開」も選べる

### 6.2 世界観更新後の過去下書き

- 過去下書きはそのまま残す
- 世界観更新時にバッジ通知「📢 X件の下書きは旧世界観で生成されています。再生成しますか？」
- 再生成は手動トリガー（暴走防止）

### 6.3 生成頻度制限（多層）

楽観試算では1日10件 × 5アカ = 50件 × 6コール = 300コール/日 になりうる。
階層的にレート制限を入れる:

| レイヤー | デフォルト | 設定キー |
|---|---|---|
| 1時間 | 3件 | `rewrite_rate_per_hour` |
| 1日 | 30件 | `rewrite_rate_per_day` |
| 1週 | 150件 | `rewrite_rate_per_week` |
| 1月 | 500件 | `rewrite_rate_per_month` |

各レイヤーの上限超過時はキューイング、24h以上キューに残った投稿はパージ（鮮度切れ）。

### 6.4 スレッド投稿（連投）

当面は1投稿目のみ対象。連投全体構造を活かすのは将来拡張。

---

## 7. コスト・レート制限

### 7.1 楽観試算（参考）

ベンチマーク3アカウント × 日次バズ1件:
- 3件 × 6コール = **18コール/日**
- Claude Sonnet で月間 ≈ $3〜5

### 7.2 現実試算（高負荷ケース）

ベンチマーク10アカウント × 日次平均5件バズ × 6コール:
- 50件 × 6コール = **300コール/日**
- ガードレール再生成最大3回 → 実質倍化することあり
- Claude Opus で月間 ≈ $50〜100

### 7.3 Anthropic API レート制限ハンドリング

- 429 受信時: 指数バックオフ（30s, 2min, 10min）
- `Retry-After` ヘッダがあれば優先
- それでも失敗なら24h後にリトライ（5.8参照）

### 7.4 コスト可視化

設定画面に常時表示:
```
今月のリライト消費: 142回 / 推定 $4.20
今週: 38回 / 推定 $1.10
```

---

## 8. Skills × Rules（処理担当の役割分担）

### 8.1 Claude Code Skills（ポータブル、複数PCで共有可能）

格納先: `~/.claude/skills/<skill-name>/SKILL.md`

| Skill | 役割 | 起動経路 |
|---|---|---|
| **persona-brainstorm** | 世界観（ペルソナ）を対話形式で引き出しMarkdown化 | 手動（`/persona-brainstorm`） |
| **buzz-rewrite** | 元バズ投稿を要素分解→世界観適用→2〜3案下書き生成 | 自動（Urads Ruleから AiExecutor経由）／手動（`/buzz-rewrite`） |

Web移行時: skill 定義は Worker 側にバンドル、`RemoteClaudeApiExecutor` がシステムプロンプトとして注入。

### 8.2 Urads Rules（Urads App側、条件発火トリガー）

**Rule: バズ自動リライト**

```
発火条件（全AND）:
1. 新規スクレイピングで scraped_posts にINSERTされた
2. バズD判定: posted_at が48h以内 AND (相対2.0x or 絶対フォールバック)
3. 同じ (source_scraped_post_id, persona_hash) の下書きが未存在
4. account_persona.content が空でない
5. 機能グローバルON
6. benchmarks.auto_rewrite_enabled = 1
7. 直近1h/1日/1週/1月 の生成数が各上限未満
8. rewrite_attempts.skip_until_manual = 0

アクション:
1. AiExecutor.runSkill('buzz-rewrite', input)
2. ガードレール通過案について posts INSERT (status='draft')
3. rewrite_attempts に成功/失敗カウント記録
4. 通知（UIバッジ + トースト + 任意デスクトップ通知）
```

### 8.3 既存Urads Skillsとの関係

| 既存スキル（skill_design.md） | 本機能との関係 |
|---|---|
| 投稿分析 | 独立 |
| 競合分析 | 要素分解キャッシュ（`analysis_results`）を**相互利用** |
| 投稿提案 | 補完関係（投稿提案はゼロから、リライトは既存投稿を翻訳）。`account_persona` を共通参照 |
| 日次レポ | 下書き生成件数を「昨日のリライト下書き: N件」として報告 |

---

## 9. UI / UX

### 9.1 タブ構成

既存タブ: 新規投稿 / 予約一覧 / 投稿履歴 / リサーチ

**Phase 1**: 既存「予約一覧」内に「下書き」サブセクションを追加（軽量）
**Phase 2**: 件数が増えたら独立タブ「リライト下書き」に昇格

理由: 早期に独立タブを増やすとナビゲーションがノイジー。データが少ないうちはサブセクションで十分。

### 9.2 下書きカードUI

```
┌──────────────────────────────────────────────┐
│ 📮 @benchmark_foo のバズからリライト（48h前）  │
│ ❤2,400 💬150 🔁80  テーマ: 仕事運→恋愛運     │
│                                                │
│ [⭐ 案A（推し）]                               │
│ ┌──────────────────────────────────────────┐│
│ │ 本文テキストエリア（編集可）                  ││
│ └──────────────────────────────────────────┘│
│ 💡 採用理由: 〜〜な読者に刺さる                │
│ 世界観: v3 ▾ 他案を見る (2)                   │
│ [元投稿を開く]                                 │
│                                                │
│ [再生成] [破棄] [日時設定] [予約に追加]      │
└──────────────────────────────────────────────┘
```

「他案を見る」をクリックでアコーディオン展開、案B/案Cを表示。

### 9.3 通知

| 手段 | 方針 |
|---|---|
| 🔴 タブバッジ（件数表示） | 必須・常時ON |
| 🔴 トースト（生成直後「@foo のバズをリライトしました」） | 必須・常時ON |
| 🟡 デスクトップ通知（Electron native） | 設定でON/OFF、デフォOFF |
| ❌ メール | 不要（Web移行時検討） |

通知機能は既存未実装のため、最小構成（バッジ・トースト）から実装し、デスクトップ通知は次フェーズ。

### 9.4 設定画面（新規）

```
[設定] > [バズ自動リライト]
├─ 機能ON/OFF（グローバル）              ← デフォOFF
├─ 通知
│   └─ デスクトップ通知  [切替]          ← デフォOFF
├─ 生成パラメータ
│   ├─ バズ倍率          [2.0x] 1.5〜5.0
│   ├─ 検知ウィンドウ    [48h]  6〜168h
│   ├─ 1時間の上限       [3件]  1〜10
│   ├─ 1日の上限         [30件]  1〜100
│   ├─ 1週の上限         [150件] 1〜500
│   └─ 1月の上限         [500件] 1〜3000
├─ ガードレール
│   ├─ N-gram連続一致上限     [3]   1〜10
│   ├─ トークン一致率上限     [60%] 30〜90
│   └─ 禁止フレーズ           [編集]
├─ コスト
│   └─ 今月: 142回 / $4.20
└─ ベンチマーク個別
    └─ アカウントごと [自動リライト ON/OFF]
```

デフォルトは **すべてOFF**（ユーザーが明示的にONにしないと動かない、暴走防止）。

### 9.5 下書きの整理

- 自動削除しない（ユーザー判断）
- ソート: 生成日時降順デフォルト、バズ度降順切替可
- 30日経過はグレーアウト表示
- 「古い下書きを一括破棄」ボタン

---

## 10. 観測性・ログ

機能改善のフィードバックループを回すため、メトリクスを最初から記録する。

### 10.1 メトリクス

```sql
CREATE TABLE rewrite_metrics (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL,
  scraped_post_id     TEXT,
  persona_hash        TEXT,
  event_type          TEXT NOT NULL,  -- 'generated' | 'skipped' | 'failed' | 'adopted' | 'discarded'
  variant_index       INTEGER,        -- 採用された案のindex（adopted時）
  guardrail_passed    INTEGER,        -- 0/1
  guardrail_reason    TEXT,           -- 失格理由（失格時）
  ngram_hits          INTEGER,
  token_overlap       REAL,
  cost_input_tokens   INTEGER,
  cost_output_tokens  INTEGER,
  cost_usd            REAL,
  duration_ms         INTEGER,
  created_at          INTEGER NOT NULL
);

CREATE INDEX idx_metrics_event ON rewrite_metrics(event_type, created_at);
```

### 10.2 ダッシュボード（Phase 2）

- 採用率: 生成された案のうちユーザーが採用した割合
- 失敗率: 理由別（タイムアウト / ガードレール / NG / API）
- 重複率: persona_hash 一致でスキップした件数
- 案別採用バイアス: 案A/B/C のどれがよく選ばれるか
- コスト推移: 日/週/月

これらを見てパラメータ（倍率、ガードレール閾値）を調整する。

---

## 11. セキュリティ・機密性

| 項目 | 対応 |
|---|---|
| account_persona の保存 | D1平文（Phase 1）→ SaaS化時 at-rest 暗号化検討 |
| アクセス制御 | license_id + account_id でテナント分離 |
| ベンチマーク投稿の著作権 | ガードレール（N-gram判定）で機械的に丸パクリ防止 |
| ユーザーへの免責表示 | 「リライト下書きは元投稿の構造を流用しています。投稿前にご自身でレビューしてください」 |
| API key（将来BYOK） | 端末ローカル暗号化保存、サーバには送らない |
| ログのPII | rewrite_metrics に投稿本文は保存しない（IDのみ） |

---

## 12. 将来拡張

| 機能 | 内容 | 優先度 |
|---|---|---|
| dry-runモード | 過去30日のバズ投稿で「もしリライトしたら」を試算 | 中 |
| 世界観A/Bテスト | persona v1 と v2 で同じバズ投稿をリライトして比較 | 中 |
| 連投スレッド対応 | スレッド全体を構造化リライト | 低 |
| 画像生成連動 | リライト本文に合わせた画像も生成 | 低（Phase 4） |
| マルチアカウント世界観共有 | チーム運用時の共通ペルソナ | 低 |

---

## 13. DBマイグレーション計画

実装時は以下の順で適用:

```
0016_account_persona.sql
  - account_persona テーブル新設
  - account_id, content, schema_version, hash, updated_at, created_at

0017_analysis_results_schema_version.sql
  - analysis_results に schema_version INTEGER NOT NULL DEFAULT 1 追加

0018_posts_rewrite_metadata.sql
  - posts に source_scraped_post_id TEXT 追加（FK to scraped_posts.id）
  - posts に rewrite_metadata TEXT (JSON) 追加
  - posts に persona_hash TEXT 追加（generated columnでもOK）
  - 部分UNIQUE INDEX uniq_post_rewrite_source

0019_benchmarks_auto_rewrite.sql
  - benchmarks に auto_rewrite_enabled INTEGER NOT NULL DEFAULT 0 追加

0020_research_settings_rewrite.sql
  - research_settings に
    - rewrite_trigger_window_hours INTEGER DEFAULT 48
    - rewrite_trigger_multiplier REAL DEFAULT 2.0
    - rewrite_trigger_baseline_days INTEGER DEFAULT 30
    - rewrite_trigger_min_posts INTEGER DEFAULT 5
    - rewrite_rate_per_hour INTEGER DEFAULT 3
    - rewrite_rate_per_day INTEGER DEFAULT 30
    - rewrite_rate_per_week INTEGER DEFAULT 150
    - rewrite_rate_per_month INTEGER DEFAULT 500
    - rewrite_global_enabled INTEGER DEFAULT 0
    - guardrail_max_ngram_hits INTEGER DEFAULT 3
    - guardrail_max_token_overlap REAL DEFAULT 0.6
    - guardrail_banned_phrases TEXT DEFAULT '[]'

0021_rewrite_attempts.sql
  - rewrite_attempts テーブル新設

0022_rewrite_metrics.sql
  - rewrite_metrics テーブル新設
```

---

## 14. 実装順（Phase分け）

### Phase A: 世界観基盤 + 手動リライト（MVP）
- account_persona テーブル + UIエディタ + プリセット
- AiExecutor 抽象化（LocalClaudeCodeExecutor のみ）
- buzz-rewrite skill 単体動作
- 手動起動: リサーチ画面の投稿カードに「リライトする」ボタン
- ガードレール（N-gram判定）実装
- 下書き保存（既存draftステータス活用、UIは予約一覧内サブセクション）

### Phase B: 自動検知ルール
- バズD判定 SQL
- 自動リライトルールの発火（Worker Cron + Electron polling）
- 重複検知（UNIQUE制約）
- 冪等性・リトライ
- レート制限（多層）
- 通知（バッジ + トースト）

### Phase C: 観測性・設定UI
- rewrite_metrics 記録
- 設定画面実装
- デスクトップ通知（任意ON）
- コスト可視化

### Phase D: Web移行準備（並行）
- RemoteClaudeApiExecutor 実装
- skill 定義のWorker側バンドル
- BYOK or プロキシ設計

---

## 15. 関連ドキュメント

- `docs/requirements.md` — 全体要件
- `docs/skill_design.md` — 既存AIスキル設計
- `docs/threads_safety_guide.md` — BAN防止・安全運用ガイド（本機能は自動投稿しないので直接影響なし）
- `docs/persona_brainstorm_template.md` — 世界観壁打ちプロンプト（非Claude Code環境用）
- `~/.claude/skills/persona-brainstorm/SKILL.md` — 世界観壁打ちskill
- `~/.claude/skills/buzz-rewrite/SKILL.md` — リライト実行skill
- `packages/worker/src/modules/research/analyzer.ts` — 既存バズ判定ロジック
- `packages/worker/migrations/core/0005_research.sql` — 既存スキーマ
- `packages/worker/migrations/core/0006_ai.sql` — 既存AI設定
