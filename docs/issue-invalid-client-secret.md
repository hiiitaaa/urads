# Issue: Invalid client_secret エラー（2026-04-09）

## エラー内容

```
トークン交換失敗: {
  "error": {
    "message": "Invalid client_secret: 70b77e37fbedd4ab8b7fcec08b58c0e1",
    "type": "OAuthException",
    "code": 101
  }
}
```

## 状況

- Threadsログイン（Step 2）は成功
- トークン交換（Step 3）でWorkerがMetaに送る `client_secret` が不正

## 原因

Cloudflare Worker の `THREADS_APP_SECRET` が Meta Developer Portal の App Secret と一致していない。
コピーミス or リセット後に古い値のまま の可能性。

## 対応手順

1. Meta Developer Portal（https://developers.facebook.com/）にログイン
2. Uradsアプリ > 設定 > 基本設定 で **App Secret** を表示・コピー
3. 以下を実行して再設定：

```bash
cd packages/worker
npx wrangler secret put THREADS_APP_SECRET
# → コピーした App Secret をペースト
```

4. 確認：Electronアプリから再度Threads認証を実行
