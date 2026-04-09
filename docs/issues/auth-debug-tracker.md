# OAuth�F�؃f�o�b�O�L�^�i2026-04-09 �i�s���j

## �ڕW

Electron�A�v������ Threads OAuth�F�؂𐬌�������B

## �F�؃t���[��3�X�e�b�v

```
Step 1: GET /license/auth-url �� �F��URL�擾 ? ����
Step 2: Electron�E�B���h�E�� Threads���O�C�� �� �F�R�[�h�擾 ? ����
Step 3: POST /license/exchange �� �g�[�N������ ? �����Ŏ��s
```

## ����܂ł̌o��

### ���s1: THREADS_APP_ID ���v���[�X�z���_�[
- **�G���[**: `An unknown error has occurred. error_code:1`
- **����**: `wrangler.toml` �� `YOUR_THREADS_APP_ID` �̂܂�
- **�Ή�**: `941586355006583` �ɒu�� + �f�v���C �� **����**

### ���s2: THREADS_APP_SECRET �� .env �̌Â��l
- **�G���[**: `Invalid client_secret: 70b77e37fbedd4ab8b7fcec08b58c0e1`
- **����**: `.env` �̒l�����̂܂� `wrangler secret put` �������AMeta Portal��̌��݂̒l�ƕs��v
- **�Ή�**: ���[�U�[�� `!` �R�}���h�ōĐݒ�

### ���s3: �Đݒ肵���l���s��
- **�G���[**: `Invalid client_secret: a5625738ea1b82f110f976a052b640bd`
- **����**: `!` �R�}���h�œ��͂����l��Meta Portal��̒l�ƈ�v���Ă��Ȃ�
- **���**: ? ������

## ���݂�Worker���ϐ����

| �ϐ� | ��� |
|------|------|
| `THREADS_APP_ID` | ? `941586355006583`�iwrangler.toml�j |
| `THREADS_APP_SECRET` | ? Meta Portal�ƕs��v�i���ݒl: `a5625738...`�j |
| `ENCRYPTION_KEY` | ? ���������ς� |
| `WEBHOOK_VERIFY_TOKEN` | ? ���������ς� |
| `THREADS_REDIRECT_URI` | ? `https://localhost:8890/callback`�iwrangler.toml�j |

## ���ɂ�邱��

### 1. Meta Developer Portal �Ő����� App Secret ���擾
- https://developers.facebook.com/ �Ƀ��O�C��
- Urads�A�v�� �� �ݒ� �� ��{�ݒ� �� App Secret �́u�\\���v���N���b�N
- **����**: �uApp Secret�v�ƁuClient Token�v�͕ʕ��BApp Secret ���g��

### 2. wrangler secret put �ōĐݒ�
```bash
! cd packages/worker && npx wrangler secret put THREADS_APP_SECRET
```
�� �R�s�[���� App Secret ���y�[�X�g

### 3. �����œ���m�F�icurl�Ńg�[�N�������e�X�g�j
```bash
# auth-url�擾
curl -s https://urads-api.nohara-ce.workers.dev/license/auth-url

# �u���E�U�Ń��O�C����A���_�C���N�gURL����code���擾����:
curl -s -X POST https://urads-api.nohara-ce.workers.dev/license/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"���ۂ̃R�[�h"}'
```
�� `Invalid client_secret` ���o�Ȃ���� Step 3 �N���A

### 4. Electron �A�v���ōŏI�m�F
```bash
cd packages/electron && npm run dev
```
�� �Z�b�g�A�b�v�E�B�U�[�h����F�ؐ������m�F

## �m�F�|�C���g

- Meta Portal�� App Secret ��**32������16�i��**�i��: `abcdef1234567890abcdef1234567890`�j
- �uClient Token�v�ł͂Ȃ��uApp Secret�v���g������
- �R�s�[���ɑO��̃X�y�[�X������Ȃ�����

