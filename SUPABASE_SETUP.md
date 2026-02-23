# Supabase セットアップ手順

クラウドでデータを共有するには、Supabase の設定が必要です。

## 1. Supabase プロジェクト作成

1. [Supabase](https://supabase.com) にアクセス
2. 新規プロジェクトを作成
3. プロジェクトの **Settings** → **API** から以下を取得:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 認証（Auth）の有効化

1. Supabase ダッシュボードで **Authentication** → **Providers**
2. **Email** を有効化（通常は初期状態で有効）
3. （任意）**Confirm email** をオフにすると、メール確認なしで即時ログイン可能
4. 初回利用時はログイン画面の「新規登録」でアカウントを作成してください

## 3. テーブル作成とRLS

1. Supabase ダッシュボードで **SQL Editor** を開く
2. `supabase/schema.sql` の内容をコピーして実行
3. 現在は RLS「Allow all」でデータアクセスを許可（ログインはUI側で制御）

## 4. 環境変数設定

**ローカル開発 (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
```

**Vercel デプロイ:**
- プロジェクト Settings → Environment Variables
- 上記2つを追加

## 5. 動作確認

1. アプリにアクセス → ログイン画面が表示される
2. 「新規登録」でメールアドレス・パスワードを登録（初回のみ）
3. ログイン後、案件を登録してリロード → データが残っていれば成功
4. ログアウト後、未ログインでURLに直接アクセス → ログイン画面にリダイレクトされる

## 6. 新規登録でエラーが出る場合

| 表示されるメッセージ | 原因 | 対処 |
|---------------------|------|------|
| 新規登録は現在無効になっています | Supabase で新規登録が無効 | Authentication → Providers → Email で「Enable email signups」をオンにする |
| このメールアドレスは既に登録されています | すでに同じメールで登録済み | ログインを試す。パスワードを忘れた場合は Supabase ダッシュボードでリセット |
| メールアドレスの確認が完了していません | Confirm email 有効で確認待ち | 送信された確認メールのリンクをクリック。迷惑メールも確認。届かない場合は **Confirm email** をオフにする |
| メール送信の制限に達しました / リクエストが多すぎます | レート制限（Supabase のデフォルトは1時間に数通） | 1時間ほど待つか、**Confirm email** をオフにしてメール送信を回避 |
| パスワードは6文字以上で | パスワードが短い | 6文字以上のパスワードを入力 |

**確認メールが届かない場合：** Supabase のデフォルトメール送信は1時間あたり数通の制限があります。**Authentication** → **Providers** → **Email** で **Confirm email** をオフにすると、メール確認なしで即座にログインできるようになります（社内利用向け）。
