-- 原価管理アプリ用 Supabase スキーマ
-- SQL Editor で実行してください

-- メインデータ（既存の場合はスキップ）
CREATE TABLE IF NOT EXISTS genka_kanri_data (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- RLS ポリシー（ログインユーザー全員が読書可能）
ALTER TABLE genka_kanri_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_genka_kanri_data" ON genka_kanri_data;
CREATE POLICY "allow_all_genka_kanri_data" ON genka_kanri_data
  FOR ALL USING (true) WITH CHECK (true);

-- バックアップ用テーブル
CREATE TABLE IF NOT EXISTS genka_kanri_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  created_by text
);

-- バックアップ用 RLS（アプリ側の AuthGuard でアクセス制御、RLS は Allow all）
ALTER TABLE genka_kanri_backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_backups" ON genka_kanri_backups;
CREATE POLICY "allow_all_backups" ON genka_kanri_backups
  FOR ALL USING (true) WITH CHECK (true);

-- インデックス（バックアップ一覧のソート用）
CREATE INDEX IF NOT EXISTS idx_genka_kanri_backups_created_at
  ON genka_kanri_backups (created_at DESC);
