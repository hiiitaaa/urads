# Threads API セットアップガイド

Threads（Meta）APIを使うためのアプリ登録〜OAuth認証までの手順。
Uradsに限らず、Threads APIを使いたい人なら誰でも使えるガイド。

---

## 1. 前提条件

- **Facebookアカウント** を持っていること
- **Threadsアカウント** を持っていること
- Facebookアカウントで **二段階認証（2FA）** が有効になっていること
- Facebookアカウントに **メールアドレス** が認証済みで登録されていること

---

## 2. Meta開発者ポータルへのアクセス

### 2.1 よくあるエラー:「アクセス権がありません」

https://developers.facebook.com/ にアクセスした時に「アクセス権がありません。この機能はまだ利用できません。」と表示される場合、以下を順番に確認する。

#### 2.1.1 二段階認証を有効にする

Facebookアカウントで2FAが必須。

- Facebook → 設定 → アカウントセンター → パスワードとセキュリティ → 二段階認証
- 認証アプリ or SMSで設定

#### 2.1.2 Facebookページを作成する

開発者ポータルにアクセスするには、**Facebookページ**（ビジネス用の公開ページ）が必要。

1. https://business.facebook.com/ にアクセス
2. 「Facebookページを作成する」をクリック
3. ページ名は何でもOK（例: `○○開発ラボ`）
4. 作成後、Meta Business Suite に入れるようになる

#### 2.1.3 開発者アカウント作成

1. https://developers.facebook.com/ を開く
2. 右上の **「開始する」** をクリック
3. 「Meta for Developersアカウントを作成」画面が表示される
4. **利用規約・開発者ポリシーに同意** → 「次へ」
5. 「メールアドレスの確認」→ ログイン時のメールがそのまま入っているので「メールアドレスを認証」で進む
6. 「当てはまるのはどれ？」→ **「開発者」** を選択
7. アプリダッシュボードが表示されればOK

---

## 3. Metaアプリの作成

### 3.1 アプリを作成

1. https://developers.facebook.com/apps/ を開く
2. **「アプリを作成」** をクリック
3. **アプリ名**を入力（例: `Urads`）
4. **連絡先メール**を入力
5. ユースケースで **「Access Threads API」**（Threads APIにアクセス）を選択
6. ビジネスポートフォリオ接続画面 → **「今はビジネスポートフォリオをリンクしない」** を選択（個人開発はこれでOK。有料配布する場合は後でビジネス検証が必要）
7. 「公開の要件」画面 → そのまま **「次へ」**
8. 「概要」画面で内容を確認 → **「アプリを作成」**

### 3.3 アプリ作成完了

ダッシュボードが開く。左メニューの **「ユースケース」** → **「Threads APIにアクセス」** → **「カスタマイズ」** から設定に入れる。

---

## 3. Threads APIの設定

### 3.1 権限（スコープ）

アプリダッシュボード → **ユースケース** → **Threads APIにアクセス** → **カスタマイズ** → **「アクセス許可と機能」**

表示される権限を全てONにする（使わないものがあっても問題なし）:

| 権限 | 用途 |
|------|------|
| `threads_basic` | **必須**。ユーザー情報取得 |
| `threads_content_publish` | 投稿の作成・公開 |
| `threads_manage_insights` | インサイト（分析）取得 |
| `threads_manage_replies` | リプライの投稿 |
| `threads_read_replies` | リプライの取得 |
| `threads_delete` | 投稿の削除 |

### 3.2 リダイレクトURIの設定

同じ画面の左メニューで **「設定」** をクリックし、以下の3つのURLを**全て**入力する（全部入れないと保存できない）:

| 項目 | 値（開発用） |
|------|------------|
| **Redirect callback URL** | `https://localhost:8890/callback` |
| **Uninstall callback URL** | `https://localhost:8890/uninstall` |
| **Delete callback URL** | `https://localhost:8890/delete` |

> **HTTPSが必須**。`http://localhost` は使えない。
> デスクトップアプリ（Electron）ではローカルHTTPSサーバーを立てるか、
> BrowserWindowでリダイレクトを横取りする方法が使える（後述）。
>
> **注意**: リダイレクトURLはコピペ後、末尾のスペースをBackspaceで消すとタグ化（×マーク付き）される。タグ化されないと保存できない。アンインストールと削除はそのまま入力でOK。

### 3.3 テスターの追加（アプリ審査なしでテスト）

アプリダッシュボード → **アプリの役割** → **「メンバーを追加」** ボタン

1. 「役割を割り当てる」画面で一番下の **「Threadsテスター」** を選択 → 「追加」
2. 自分のThreadsユーザー名を入力して招待
3. 招待されたユーザーは **Threadsアプリの設定** → **「ウェブサイトのアクセス許可」** で招待を承認
4. アプリ審査を通さなくても、テスターに追加したアカウントでAPIが使える

---

## 4. App IDとApp Secretの確認

### 4.1 確認場所

以下のどちらからでも確認可能:

- **マイアプリ** → アプリの **「設定」** → **「ベーシック」**
- **ユースケース** → **Threads APIにアクセス** → **カスタマイズ** → **「設定」**

> **注意**: ベーシック画面には「アプリID」と「ThreadsアプリID」の2つがある。**必ず「ThreadsアプリID」と「Threadsのapp secret」を使うこと**。上部の「アプリID」はFacebook用で別物。

### 4.2 保存

この2つをメモしておく（後でOAuth認証に使う）:

```
THREADS_APP_ID=xxxxxxxxxx
THREADS_APP_SECRET=xxxxxxxxxxxxxxxx
```

---

## 5. OAuth 2.0 認証フロー

Threads APIはOAuth 2.0の認可コードフローを使う。

### 5.1 全体の流れ

```
ユーザー → 認可画面（threads.net）→ 認可コード取得
         → 認可コードをアクセストークンに交換（短期）
         → 短期トークンを長期トークンに交換（60日有効）
         → 60日以内にリフレッシュ（さらに60日延長）
```

### 5.2 ステップ1: 認可URLを開く

ブラウザで以下のURLを開く:

```
https://threads.net/oauth/authorize
  ?client_id={THREADS_APP_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_read_replies
  &response_type=code
  &state={ランダム文字列（CSRF対策）}
```

ユーザーが許可すると、リダイレクトURIに認可コードが付いて返ってくる:

```
https://localhost:8890/callback?code=XXXXXX&state={ランダム文字列}
```

### 5.3 ステップ2: 認可コードをアクセストークンに交換

```
POST https://graph.threads.net/oauth/access_token

Content-Type: application/x-www-form-urlencoded

client_id={THREADS_APP_ID}
client_secret={THREADS_APP_SECRET}
code={認可コード}
grant_type=authorization_code
redirect_uri={REDIRECT_URI}
```

レスポンス:
```json
{
  "access_token": "THQVJ...",
  "user_id": 12345
}
```

> **認可コードは1時間で失効、1回しか使えない。**

### 5.4 ステップ3: 短期トークンを長期トークンに交換

```
GET https://graph.threads.net/access_token
  ?grant_type=th_exchange_token
  &client_secret={THREADS_APP_SECRET}
  &access_token={短期トークン}
```

レスポンス:
```json
{
  "access_token": "THQVJ...(長期)",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

> **長期トークンは60日間有効。**

### 5.5 ステップ4: トークンのリフレッシュ

期限切れ前にリフレッシュすると、さらに60日延長される:

```
GET https://graph.threads.net/refresh_access_token
  ?grant_type=th_refresh_token
  &access_token={長期トークン}
```

> **期限が切れたトークンはリフレッシュできない。再度ステップ1からやり直し。**

---

## 6. トークンの有効期限まとめ

| トークン種別 | 有効期限 |
|------------|---------|
| 認可コード | 1時間（1回使い切り） |
| 短期アクセストークン | 約1時間 |
| 長期アクセストークン | **60日** |
| リフレッシュ後 | 60日（リフレッシュ日から） |

---

## 7. APIレートリミット

24時間のローリングウィンドウ（アプリ×ユーザーの組み合わせごと）:

| アクション | 上限 |
|-----------|------|
| 投稿（カルーセルは1投稿扱い） | 250件/24時間 |
| リプライ | 1,000件/24時間 |
| 削除 | 100件/24時間 |

投稿クォータの確認:
```
GET https://graph.threads.net/v1.0/{user_id}/threads_publishing_limit
  ?fields=quota_usage,config
  &access_token={TOKEN}
```

---

## 8. コンテンツ制限

| 種別 | 制限 |
|------|------|
| テキスト | 500文字以内 |
| 画像 | JPEG/PNG、8MB以下、幅320〜1440px |
| 動画 | MOV/MP4、5分以内、1GB以下、23〜60FPS |
| カルーセル | 2〜20枚 |

---

## 9. デスクトップアプリ（Electron）でのOAuth

デスクトップアプリでは「ブラウザでログイン → ローカルにリダイレクト」の流れになる。

### 方法A: BrowserWindowでリダイレクト横取り（推奨）

Electronの `BrowserWindow` で認可URLを開き、リダイレクトを検知してコードを取得する。
実際にローカルサーバーを立てる必要がない。

```typescript
// 概略
const authWindow = new BrowserWindow({ ... });
authWindow.loadURL(authUrl);

authWindow.webContents.on('will-redirect', (event, url) => {
  if (url.startsWith(REDIRECT_URI)) {
    event.preventDefault();
    const code = new URL(url).searchParams.get('code');
    // code を使ってトークン交換
    authWindow.close();
  }
});
```

### 方法B: ローカルHTTPSサーバー

- `https://localhost:8890/callback` でHTTPSサーバーを立てる
- 自己署名証明書を使用
- コールバックでコードを受け取ってトークン交換

---

## 10. アプリ審査（公開配布時のみ）

自分とテスターだけで使う分にはアプリ審査不要。
第三者に配布する場合は以下が必要:

1. **Tech Provider 検証**（約1週間）
2. **各権限ごとにアプリ審査を提出**（スクリーンキャスト動画が必要）
3. 審査期間: 2〜4週間/権限

---

## 11. APIエンドポイント一覧（よく使うもの）

ベースURL: `https://graph.threads.net/v1.0`

| メソッド | エンドポイント | 用途 |
|---------|--------------|------|
| GET | `/me?fields=id,username,name` | 自分の情報 |
| POST | `/{user_id}/threads` | メディアコンテナ作成 |
| POST | `/{user_id}/threads_publish` | 投稿公開 |
| GET | `/{user_id}/threads` | 投稿一覧 |
| GET | `/{thread_id}` | 投稿詳細 |
| DELETE | `/{thread_id}` | 投稿削除 |
| GET | `/{user_id}/threads_publishing_limit` | クォータ確認 |

### テキスト投稿の例

```
# 1. メディアコンテナ作成
POST /{user_id}/threads
  ?media_type=TEXT
  &text=Hello, Threads!
  &access_token={TOKEN}

# 2. 公開
POST /{user_id}/threads_publish
  ?creation_id={container_id}
  &access_token={TOKEN}
```
