# Issue: Threads OAuth�F�؃G���[

## �G���[���e

```json
{"error_message":"An unknown error has occurred.","error_code":1}
```

## ����

Cloudflare Worker�̊��ϐ� `THREADS_APP_ID` ���v���[�X�z���_�[ (`YOUR_THREADS_APP_ID`) �̂܂܁B
OAuth�F��URL�Ɏ��ۂ�App ID�������Ă��Ȃ����߁AThreads API���G���[��Ԃ��B

## ���O�؋�

```
[oauth] Navigation: https://www.threads.com/oauth/authorize?client_id=YOUR_THREADS_APP_ID&redirect_uri=https%3A%2F%2Floc...
[oauth] Navigation: https://www.threads.com/oauth/authorize/error.json?error_message=An+unknown+error+has+occurred.&erro...
```

## �Ή�

Cloudflare Worker�̈ȉ��̊��ϐ��𐳂����l�ɐݒ肷��:

- `THREADS_APP_ID` ? Meta Developer Portal����擾
- `THREADS_APP_SECRET` ? Meta Developer Portal����擾
- `THREADS_REDIRECT_URI` ? `https://localhost:8890/callback`�i���݂̐ݒ�l�j

### �ݒ���@

```bash
# Cloudflare Dashboard > Workers > urads-api > Settings > Variables
# �܂���
npx wrangler secret put THREADS_APP_ID
npx wrangler secret put THREADS_APP_SECRET
npx wrangler secret put THREADS_REDIRECT_URI
```

## ������

2026-04-09

