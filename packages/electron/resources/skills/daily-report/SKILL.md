---
name: daily-report
description: 昨日の成績と今日のアクションプランを提示する
trigger: 日次レポート
persona: SNSマーケティングマネージャー
maxTurns: 10
---

## ゴール
昨日の投稿パフォーマンスを振り返り、今日やるべきことを3つ提案する。

## ワークフロー

### Step 1: アカウント取得
```bash
curl -s http://localhost:8787/accounts
```

### Step 2: 投稿履歴取得
```bash
curl -s "http://localhost:8787/posts?status=posted"
```
昨日の投稿を抽出（posted_atが昨日の範囲）。

### Step 3: リプライ活動確認
```bash
curl -s "http://localhost:8787/replies/logs?limit=50"
```
昨日の自動返信件数を集計。

### Step 4: API残量確認
```bash
curl -s http://localhost:8787/research/limits
curl -s "http://localhost:8787/posts/quota?account_id={id}"
```

### Step 5: 成績まとめ
- 投稿数
- 合計エンゲージメント
- ベスト投稿
- ワースト投稿

### Step 6: アクションプラン
今日やるべきこと3つを提案。根拠付き。

## 出力形式（必須）

```
## 日次レポート（YYYY-MM-DD）

### 昨日の成績
- 投稿数: X件
- 合計❤: X / 合計💬: X / 合計🔁: X
- ベスト投稿: 「...」（❤X）
- ワースト投稿: 「...」（❤X）

### リプライ自動化
- 自動返信: X件
- アクティブルール: X個

### API残量
- 投稿: X/200（24h）
- リサーチ: profile X/160, threads X/160

### 今日のアクションプラン
1. **[投稿]** ...（理由: ...）
2. **[分析]** ...（理由: ...）
3. **[改善]** ...（理由: ...）
```

## 自己レビュー（60点→100点）
1. 数字は正確か？（API結果と一致しているか）
2. アクションプランは具体的か？（「頑張る」ではなく具体的な行動）
3. 問題があれば修正する
