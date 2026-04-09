# Issue: Invalid client_secret �G���[�i2026-04-09�j

## �G���[���e

```
�g�[�N���������s: {
  "error": {
    "message": "Invalid client_secret: 70b77e37fbedd4ab8b7fcec08b58c0e1",
    "type": "OAuthException",
    "code": 101
  }
}
```

## ��

- Threads���O�C���iStep 2�j�͐���
- �g�[�N�������iStep 3�j��Worker��Meta�ɑ��� `client_secret` ���s��

## ����

Cloudflare Worker �� `THREADS_APP_SECRET` �� Meta Developer Portal �� App Secret �ƈ�v���Ă��Ȃ��B
�R�s�[�~�X or ���Z�b�g��ɌÂ��l�̂܂� �̉�\���B

## �Ή��菇

1. Meta Developer Portal�ihttps://developers.facebook.com/�j�Ƀ��O�C��
2. Urads�A�v�� > �ݒ� > ��{�ݒ� �� **App Secret** ��\\���E�R�s�[
3. �ȉ������s���čĐݒ�F

```bash
cd packages/worker
npx wrangler secret put THREADS_APP_SECRET
# �� �R�s�[���� App Secret ���y�[�X�g
```

4. �m�F�FElectron�A�v������ēxThreads�F�؂����s

