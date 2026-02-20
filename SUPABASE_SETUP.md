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
