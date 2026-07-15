# Supabase セットアップ手順

クラウドでデータを共有するには、Supabase の設定が必要です。

## 1. Supabase プロジェクト作成

1. [Supabase](https://supabase.com) にアクセス
2. 新規プロジェクトを作成
3. プロジェクトの **Settings** → **API** から以下を取得:
 - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
 - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`（サーバー専用・公開しない）

## 2. 認証（Auth）の有効化

1. Supabase ダッシュボードで **Authentication** → **Providers**
2. **Email** を有効化（通常は初期状態で有効）
3. （任意）**Confirm email** をオフにすると、メール確認なしで即時ログイン可能
4. ユーザー発行はアプリの `/admin` または API から行います（ログイン画面の公開新規登録は廃止）

## 3. テーブル作成とRLS

1. Supabase ダッシュボードで **SQL Editor** を開く
2. `supabase/schema.sql` の内容をコピーして実行
3. バックアップ機能を使う場合は `genka_kanri_backups` テーブルも同じ SQL で作成されます

## 3-2. 機能追加SQL（2026年6月: 権限管理・変更履歴・領収書添付）

1. **SQL Editor** で `supabase/features_upgrade.sql` の内容をコピーして実行
2. これにより以下が有効になります（実行するまでアプリは従来通り動作します）:
 - **権限管理**: アカウント管理画面で「閲覧のみ / 入力可 / 管理者」を設定可能に
 - **変更履歴**: 「誰がいつ何を変更したか」がサイドバーの「変更履歴」に記録される
 - **領収書・請求書の写真添付**: 原価明細に写真を添付できる（receipts バケット）
3. 既存テーブル・既存データには一切変更を加えません（新規追加のみ）

## 3-3. マルチテナントSQL（会社IDログイン・データ分離）

1. **SQL Editor** で `supabase/multi_tenant.sql` を実行
2. 会社テーブル・所属ユーザー・RLS の会社分離が有効になります
3. 自社は会社コード `tokito` として作成されます
4. 詳細は `docs/マルチテナント設定.md` を参照

## 4. 環境変数設定

**ローカル開発 (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx...
```

**Vercel デプロイ:**
- プロジェクト Settings → Environment Variables
- 上記を追加（`SUPABASE_SERVICE_ROLE_KEY` は必須）

## 5. 動作確認

1. アプリにアクセス → ログイン画面が表示される
2. 会社ID `tokito` + ログインID（従来メール）+ パスワードでログイン
3. ログイン後、案件を登録してリロード → データが残っていれば成功
4. ログアウト後、未ログインでURLに直接アクセス → ログイン画面にリダイレクトされる

## 6. ログインでエラーが出る場合

| 表示されるメッセージ | 原因 | 対処 |
|---------------------|------|------|
| SUPABASE_SERVICE_ROLE_KEY が設定されていません | サーバー側キー不足 | Vercel / `.env.local` に service_role を追加して再デプロイ |
| 会社IDまたはログイン情報が正しくありません | 会社コード違い / 未紐付け | `multi_tenant.sql` 実行済みか、会社ID=`tokito` か確認 |
| 会社ID・ログインIDまたはパスワードが正しくありません | パスワード誤りなど | パスワードを確認。既存ユーザーはログインIDにメール全体を入れる |
