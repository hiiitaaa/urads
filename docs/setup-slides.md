# Urads 導入ガイド（図解版）

PC に詳しくなくても大丈夫。1 ステップずつ進めてください。
分からなくなったら、このページに戻って次のステップを確認。

---

## 全体の流れ（5 パート、約 50 分）

```
Part 1  ツールを入れる        （5 分）
Part 2  Cloudflare に登録     （10 分）
Part 3  Threads API を準備    （20 分）
Part 4  Urads をセットアップ   （10 分）
Part 5  アプリを起動          （5 分）
```

---

# Part 1: ツールを入れる（5 分）

3 つのツールをインストールします。全部無料。

---

## 1-1. Node.js をインストール

1. ブラウザで開く: **https://nodejs.org/**
2. 緑色のボタン **「LTS」** をクリック → ダウンロード開始
3. ダウンロードしたファイルをダブルクリック
4. 「Next」を押し続けて最後に「Install」→ 完了

```
確認方法:
  Mac → 「ターミナル」アプリを開く
  Win → 「PowerShell」を開く（スタートメニューで検索）

  以下を入力して Enter:
  node --version

  → 「v20.x.x」のような数字が出れば OK
```

---

## 1-2. pnpm を有効化

ターミナル（Mac）または PowerShell（Win）で:

```
corepack enable
```

Enter を押す。何も表示されなければ成功。

---

## 1-3. Git をインストール

**Mac の場合:**
ターミナルで `git --version` と入力。
→ 「Xcode Command Line Tools をインストールしますか？」と聞かれたら「インストール」

**Windows の場合:**
1. ブラウザで開く: **https://git-scm.com/download/win**
2. 自動でダウンロード開始
3. インストーラーを実行 → 全部デフォルトのまま「Next」→「Install」

---

# Part 2: Cloudflare に登録（10 分）

Urads のデータを保存するクラウドサービスです。無料で使えます。

---

## 2-1. アカウント作成

1. ブラウザで開く: **https://dash.cloudflare.com/sign-up**
2. メールアドレスとパスワードを入力
3. 「Sign Up」をクリック
4. メールが届く → メール内のリンクをクリックして確認

---

## 2-2. Wrangler にログイン

ターミナル / PowerShell で:

```
npx wrangler login
```

→ ブラウザが自動で開く
→ 「Allow」（許可）をクリック
→ ターミナルに「Successfully logged in」と表示されれば OK

---

# Part 3: Threads API を準備（20 分）

自分の Threads アカウントで投稿するための設定です。
**ここが一番時間がかかります。落ち着いてやりましょう。**

---

## 3-1. Facebook の二段階認証を ON にする

**これが必須です。やらないと次に進めません。**

1. スマホで **Google Authenticator** アプリをインストール
   - iPhone: App Store で「Google Authenticator」検索
   - Android: Google Play で「Google Authenticator」検索

2. PC のブラウザで開く: **https://www.facebook.com/settings**
3. 「パスワードとセキュリティ」をクリック
4. 「二段階認証」をクリック
5. 「認証アプリ」を選択
6. 画面に QR コードが表示される → スマホの Google Authenticator で読み取り
7. アプリに表示された 6 桁の数字を入力 → 「確認」

```
うまくいかない場合:
  Facebook のヘルプセンターで「二段階認証」を検索
```

---

## 3-2. Facebook ページを作成

開発者ポータルに入るために必要です（1 分で終わります）。

1. ブラウザで開く: **https://www.facebook.com/pages/create**
2. 「ビジネスまたはブランド」を選択
3. ページ名を入力（何でも OK、例:「My Tool Lab」）
4. カテゴリを選択（何でも OK）
5. 「作成」をクリック

---

## 3-3. 開発者ポータルにアクセス

1. ブラウザで開く: **https://developers.facebook.com/**
2. 右上の「開始する」または「マイアプリ」をクリック
3. 開発者規約に同意

```
「アクセス権がありません」と表示される場合:
  → 3-1 の二段階認証と 3-2 の Facebook ページ作成を確認
```

---

## 3-4. アプリを作成

1. 「アプリを作成」をクリック
2. **「Access Threads API」** を選択（これ以外は選ばない！）
3. アプリ名を入力（例:「Urads」）
4. 連絡先メールアドレスを入力
5. 「作成」をクリック

---

## 3-5. リダイレクト URI を設定

**3 つの URL を全部入力しないと保存できません。**

1. 左メニュー「Threads ログイン」→「設定」
2. 以下の 3 つをコピーして貼り付け:

```
Threads リダイレクト コールバック URL:
https://localhost:8890/callback

アカウント削除リクエスト コールバック URL:
https://localhost:8890/uninstall

データ削除リクエスト コールバック URL:
https://localhost:8890/delete
```

3. 「変更を保存」をクリック

---

## 3-6. App ID と App Secret をメモ

1. 左メニュー「設定」→「基本」
2. **App ID** の数字をコピー → メモ帳に貼り付け
3. **App Secret** の「表示」をクリック → コピー → メモ帳に貼り付け

```
!!重要!!
この 2 つは Part 4 で使います。なくさないで！
```

---

## 3-7. 自分をテスターに追加

1. 左メニュー「アプリの役割」→「役割」
2. 「Threads テスター」の「追加」をクリック
3. 自分の **Threads ユーザー名**を入力 → 追加

---

## 3-8. スマホで招待を承認（ここが迷いやすい！）

**PC ではなく、スマホの Threads アプリで行います。**

1. スマホで **Threads アプリ**を開く
2. プロフィール → 右上の **設定アイコン**
3. 「アカウント」→「ウェブサイトのアクセス許可」
4. 「招待」タブに表示されている招待を **「承認」**

```
承認しないと、この後の認証が失敗します！
「招待が見つからない」場合は 3-7 からやり直してください。
```

---

# Part 4: Urads をセットアップ（10 分）

---

## 4-1. ソースコードを取得

ターミナル / PowerShell で以下を 1 行ずつ入力して Enter:

```
git clone https://github.com/YOUR_USERNAME/urads.git
cd urads
```

---

## 4-2. セットアップを実行

**Mac の場合:**
```
pnpm setup
```

**Windows の場合:**
```
pnpm setup:win
```

→ 自動で色々な設定が始まります
→ 途中で以下を聞かれます:

```
THREADS_APP_ID:
→ 3-6 でメモした App ID を貼り付けて Enter

THREADS_APP_SECRET:
→ 3-6 でメモした App Secret を貼り付けて Enter
```

→ 最後に **Workers URL** が表示されます

```
Workers URL: https://urads-api.xxxxx.workers.dev
```

**この URL をコピーしてください！Part 5 で使います。**

---

# Part 5: アプリを起動（5 分）

---

## 5-1. アプリを起動

```
pnpm dev
```

→ アプリウィンドウが開きます

---

## 5-2. セットアップウィザード

1. **「サーバー接続」** 画面が表示される
2. Part 4 でコピーした Workers URL を貼り付け
3. 「接続テスト」をクリック → 「接続 OK」が表示される
4. 「次へ」をクリック

---

## 5-3. Threads アカウントを連携

1. 「Threads アカウントを連携する」をクリック
2. ブラウザが開く → Threads アカウントでログイン
3. 「許可する」をクリック
4. アプリに戻る → 「@ユーザー名 を連携しました」と表示

---

## 5-4. 完了！

「始める」をクリック → Urads のメイン画面が表示されます。

```
次回からの起動は:
  cd urads
  pnpm dev

これだけ！
```

---

# トラブルシューティング

| こうなった | こうする |
|-----------|---------|
| 「node が見つからない」 | Part 1-1 をやり直す |
| 「wrangler login」でブラウザが開かない | ターミナルに表示された URL を手動でブラウザに貼り付け |
| 「アクセス権がありません」（開発者ポータル） | Part 3-1（二段階認証）と 3-2（Facebook ページ）を確認 |
| セットアップスクリプトでエラー | スクリーンショットを撮って開発者に送る |
| OAuth 認証が失敗する | Part 3-8（スマホでの招待承認）を確認 |
| 「接続テスト」が失敗する | Workers URL が正しいか確認。`https://` で始まっているか |
| アプリが白画面 | ログファイルを送ってください（下記参照） |

---

# ログファイルの場所

問題が起きたら、このファイルを送ってください:

- **Mac**: `~/Library/Logs/Urads/main.log`
  - Finder → 移動 → フォルダへ移動 → 上のパスを貼り付け

- **Windows**: `%APPDATA%\Urads\logs\main.log`
  - エクスプローラーのアドレスバーに `%APPDATA%\Urads\logs` と入力して Enter

---

# 必要なもの チェックリスト

セットアップ前に確認:

- [ ] PC（Mac または Windows）
- [ ] Google Chrome がインストールされている
- [ ] Facebook アカウントがある
- [ ] Threads アカウントがある
- [ ] スマホに Google Authenticator が入っている（or 入れられる）
- [ ] メモ帳（App ID と App Secret をメモするため）
