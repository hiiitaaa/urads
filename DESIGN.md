# DESIGN.md — Urads デザインシステム

> ターゲット: AI占い師・スピリチュアル系クリエイター
> トーン: 神秘的でありながら温かく親しみやすい

---

## 1. Visual Theme & Atmosphere

- **デザイン方針**: 神秘的 × 温かみ × 親しみやすさ。占い師が「自分のためのツールだ」と感じられる世界観
- **密度**: ゆったり。余白多め、1画面の情報量を絞る
- **キーワード**: mystical, warm, approachable, gentle, trustworthy

---

## 2. Color Palette & Roles

### Primary（ブランドカラー）

- **Primary** (`#7C5CBF`): ラベンダーパープル。神秘性と柔らかさの両立。CTAボタン、アクセント
- **Primary Light** (`#A78BDB`): ホバー、選択状態、アクティブタブ背景
- **Primary Dark** (`#5B3D99`): プレス状態、重要テキスト

### Accent（ゴールド系 — 高級感・特別感）

- **Gold** (`#D4A853`): 星、占い結果のハイライト、バッジ、成功アクション
- **Gold Light** (`#E8C97A`): ゴールド背景のホバー
- **Gold Soft** (`rgba(212, 168, 83, 0.1)`): ゴールドの薄い背景

### Semantic（意味的な色）

- **Danger** (`#D96B6B`): エラー・削除（赤すぎず、柔らかいトーン）
- **Warning** (`#D4A853`): 警告（ゴールドと兼用）
- **Success** (`#6BBF8A`): 成功・完了（ミントグリーン）
- **Info** (`#6BA3D9`): 情報・ヒント

### Neutral（ニュートラル — 温かみのあるグレー）

- **Text Primary** (`#2D2640`): 本文テキスト（純黒ではなく紫みのダークカラー）
- **Text Secondary** (`#7A7089`): 補足テキスト、ラベル
- **Text Muted** (`#A89BB8`): プレースホルダー、非活性テキスト
- **Border** (`#E2DDE8`): 区切り線、入力欄の枠（紫みの薄いグレー）
- **Border Focus** (`#7C5CBF`): フォーカス時のボーダー
- **Background** (`#F8F5FC`): ページ背景（ほんのり紫がかった白）
- **Surface** (`#FFFFFF`): カード、モーダルの面
- **Surface Elevated** (`#FAF7FF`): ホバーカード、アクティブエリア

### ダークモード（アプリ本体用）

- **Dark BG** (`#1E1A2E`): メイン背景（温かみのあるダーク紫）
- **Dark Surface** (`#2A2540`): カード背景
- **Dark Surface Hover** (`#352F50`): ホバー状態
- **Dark Border** (`#3D3660`): ボーダー
- **Dark Text** (`#E8E4F0`): 本文テキスト
- **Dark Text Secondary** (`#A89BB8`): 補足テキスト

---

## 3. Typography Rules

### 3.1 和文フォント

- **ゴシック体**: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif
- **丸ゴシック**（推奨 — 親しみやすさ）: "M PLUS Rounded 1c", "Noto Sans JP", sans-serif

### 3.2 欧文フォント

- **サンセリフ**: "Inter", "Helvetica Neue", Arial, sans-serif
- **等幅**: "JetBrains Mono", "Consolas", monospace

### 3.3 font-family 指定

```css
/* 本文（温かみ重視 — 丸ゴシック） */
font-family: "M PLUS Rounded 1c", "Noto Sans JP", "Hiragino Sans", sans-serif;

/* 見出し（少しシャープに） */
font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;

/* 等幅（コマンド表示用） */
font-family: "JetBrains Mono", "Consolas", "Menlo", monospace;
```

**Google Fonts 読み込み:**
```html
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500;700&family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet">
```

### 3.4 文字サイズ・ウェイト階層

| Role | Font | Size | Weight | Line Height | Letter Spacing | 備考 |
|------|------|------|--------|-------------|----------------|------|
| Display | Rounded | 36px | 700 | 1.3 | 0.02em | ページタイトル |
| Heading 1 | Noto Sans | 28px | 700 | 1.4 | 0.02em | セクション見出し |
| Heading 2 | Noto Sans | 22px | 600 | 1.4 | 0.02em | サブ見出し |
| Heading 3 | Rounded | 18px | 500 | 1.5 | 0.03em | 小見出し |
| Body | Rounded | 16px | 400 | 1.8 | 0.04em | 本文 |
| Body Small | Rounded | 14px | 400 | 1.7 | 0.04em | 補足本文 |
| Caption | Rounded | 12px | 400 | 1.6 | 0.05em | 注釈、タイムスタンプ |

### 3.5 行間・字間

- **本文の行間**: `line-height: 1.8`（ゆったり読みやすく）
- **見出しの行間**: `line-height: 1.4`
- **本文の字間**: `letter-spacing: 0.04em`（日本語の可読性向上）
- **見出しの字間**: `letter-spacing: 0.02em`

### 3.6 禁則処理

```css
word-break: keep-all;
overflow-wrap: break-word;
line-break: strict;
```

---

## 4. Component Stylings

### Buttons

**Primary（メインアクション）**
- Background: `#7C5CBF`
- Background Hover: `#A78BDB`
- Text: `#FFFFFF`
- Padding: 12px 28px
- Border Radius: 12px（大きめ丸み）
- Font Size: 15px
- Font Weight: 500
- Shadow: `0 2px 8px rgba(124, 92, 191, 0.3)`
- Transition: `all 0.2s ease`

**Secondary（サブアクション）**
- Background: `transparent`
- Text: `#7C5CBF`
- Border: 1.5px solid `#7C5CBF`
- Padding: 10px 24px
- Border Radius: 12px

**Gold（特別なアクション — 占い実行、AI生成等）**
- Background: `linear-gradient(135deg, #D4A853, #E8C97A)`
- Text: `#2D2640`
- Padding: 12px 28px
- Border Radius: 12px
- Shadow: `0 2px 12px rgba(212, 168, 83, 0.4)`

**Ghost（控えめなアクション）**
- Background: `transparent`
- Text: `#7A7089`
- Border: 1px solid `#E2DDE8`
- Padding: 8px 18px
- Border Radius: 10px

### Inputs

- Background: `#FFFFFF`（ライト）/ `#2A2540`（ダーク）
- Border: 1.5px solid `#E2DDE8`（ライト）/ `#3D3660`（ダーク）
- Border Focus: 1.5px solid `#7C5CBF`
- Border Radius: 10px
- Padding: 10px 14px
- Font Size: 15px
- Placeholder Color: `#A89BB8`
- Shadow Focus: `0 0 0 3px rgba(124, 92, 191, 0.15)`

### Cards

- Background: `#FFFFFF`（ライト）/ `#2A2540`（ダーク）
- Border: 1px solid `#E2DDE8`（ライト）/ `#3D3660`（ダーク）
- Border Radius: 16px（大きめ丸み）
- Padding: 24px
- Shadow: `0 2px 12px rgba(45, 38, 64, 0.06)`
- Shadow Hover: `0 4px 20px rgba(124, 92, 191, 0.12)`
- Transition: `box-shadow 0.2s ease, transform 0.2s ease`
- Transform Hover: `translateY(-2px)`

### Tags / Badges

- Background: `rgba(124, 92, 191, 0.1)`
- Text: `#7C5CBF`
- Padding: 4px 10px
- Border Radius: 20px（ピル型）
- Font Size: 12px

### Divider

- Color: `#E2DDE8`（ライト）/ `#3D3660`（ダーク）
- Style: `1px solid`
- Margin: 24px 0

---

## 5. Layout Principles

### Spacing Scale

| Token | Value | 用途 |
|-------|-------|------|
| XS | 4px | アイコンとテキストの間 |
| S | 8px | 同グループ内の要素間 |
| M | 16px | セクション内の要素間 |
| L | 24px | セクション間 |
| XL | 40px | 大きなセクション間 |
| XXL | 64px | ページレベルの区切り |

### Container

- Max Width: 720px（スライド）/ 1200px（アプリ）
- Padding: 24px（モバイル）/ 40px（デスクトップ）

### Grid

- Columns: 1（スライド）/ 12（アプリ）
- Gutter: 16px

---

## 6. Depth & Elevation

| Level | Shadow | 用途 |
|-------|--------|------|
| 0 | none | フラットな要素 |
| 1 | `0 2px 8px rgba(45, 38, 64, 0.06)` | カード、セクション |
| 2 | `0 4px 16px rgba(45, 38, 64, 0.1)` | ドロップダウン、ポップオーバー |
| 3 | `0 8px 32px rgba(45, 38, 64, 0.15)` | モーダル、ダイアログ |
| 4 | `0 12px 48px rgba(45, 38, 64, 0.2)` | フローティングパネル |

---

## 7. Iconography & Decorations

### アイコンスタイル

- **線幅**: 1.5px（細めで上品に）
- **角**: 丸め（Rounded）
- **サイズ**: 20px（本文横）/ 24px（ボタン内）/ 32px（見出し横）

### 装飾要素（占い師向け）

- **星**: `✦` `✧` — ハイライト、成功表示
- **月**: `☽` — ナビゲーションアクセント
- **クリスタル**: `◈` — 特別な機能の強調
- **スパークル**: `✨` — AI生成結果の装飾

### グラデーション（控えめに使用）

```css
/* ゴールドグラデーション（CTAボタン、ハイライト） */
background: linear-gradient(135deg, #D4A853, #E8C97A);

/* パープルグラデーション（ヘッダー、カバー） */
background: linear-gradient(135deg, #1E1A2E, #3D2E6B);

/* オーロラグラデーション（スライドの背景装飾、控えめに） */
background: linear-gradient(135deg, #1E1A2E 0%, #2D1F4E 40%, #1E2A3E 100%);
```

---

## 8. Do's and Don'ts

### Do（推奨）

- 丸みを多用する（border-radius: 10px〜16px）
- 余白をたっぷり取る（詰め込まない）
- パープルとゴールドをアクセントに使う
- 丸ゴシック（M PLUS Rounded）で親しみやすさを出す
- ホバー時にふわっとした動き（translateY、shadow変化）
- 占い関連の装飾記号を控えめに使う（✦ ☽ ◈）
- 1画面1メッセージの原則（スライド）

### Don't（禁止）

- 純黒 `#000000` を使わない → `#2D2640` を使う
- 角張ったデザイン（border-radius: 0〜4px）にしない
- 情報を詰め込みすぎない
- テック感の強いモノスペースフォントを装飾に使わない（コマンド表示のみ）
- 原色（純赤、純青）を使わない → くすんだ、温かみのある色に
- シャドウを強くしすぎない（opacity 0.2以下）

---

## 9. Agent Prompt Guide

### クイックリファレンス

```
Primary: #7C5CBF (ラベンダーパープル)
Gold: #D4A853 (ウォームゴールド)
Text: #2D2640 (ダーク紫)
Background: #F8F5FC (ソフトラベンダー) / #1E1A2E (ダークモード)
Font Body: "M PLUS Rounded 1c", sans-serif
Font Heading: "Noto Sans JP", sans-serif
Border Radius: 12px (buttons) / 16px (cards)
Line Height: 1.8 (body)
Tone: 神秘的 × 温かい × 親しみやすい
Target: AI占い師・スピリチュアル系クリエイター
```

### プロンプト例

```
Uradsのデザインシステムに従って、セットアップガイドのスライドを作成してください。
- 背景: #1E1A2E〜#3D2E6B のグラデーション
- テキスト: #E8E4F0（本文）、#D4A853（アクセント）
- フォント: M PLUS Rounded 1c（本文）、Noto Sans JP（見出し）
- ボタン: border-radius 12px、shadow付き
- カード: border-radius 16px、ホバーで浮き上がる
- トーン: テック感を排除し、占い師が使いやすい温かい雰囲気
- 装飾: ✦ や ☽ を控えめに使用
```
