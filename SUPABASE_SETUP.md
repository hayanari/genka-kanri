# Supabase セットアップ手順

クラウドでデータを共有するには、Supabase の設定が必要です。

## 1. Supabase プロジェクト作成

1. [Supabase](https://supabase.com) にアクセス
2. 新規プロジェクトを作成
3. プロジェクトの **Settings** → **API** から以下を取得:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. テーブル作成

1. Supabase ダッシュボードで **SQL Editor** を開く
2. `supabase/schema.sql` の内容をコピーして実行

## 3. 環境変数設定

**ローカル開発 (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx...
```

**Vercel デプロイ:**
- プロジェクト Settings → Environment Variables
- 上記2つを追加

## 4. 動作確認

- 案件を登録してリロード → データが残っていれば成功
- 別のブラウザや端末から同じURLで開く → 同じデータが表示されればクラウド共有OK
