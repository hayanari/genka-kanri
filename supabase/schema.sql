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

-- ================================================================
-- スケジュール管理用テーブル
-- ================================================================

-- 予定エントリ
CREATE TABLE IF NOT EXISTS schedule_entries (
  id          text PRIMARY KEY,
  date        date NOT NULL,
  koujimei    text NOT NULL DEFAULT '',
  shift       text NOT NULL CHECK (shift IN ('day','night','off')),
  workers     text[] NOT NULL DEFAULT '{}',
  memo        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_entries_date_idx ON schedule_entries(date);

-- 車両ID列追加（本体の車両マスターと連動）
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS vehicle_ids text[] DEFAULT '{}';

-- 作業員マスター
CREATE TABLE IF NOT EXISTS schedule_workers (
  id          serial PRIMARY KEY,
  name        text UNIQUE NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 日次メモ
CREATE TABLE IF NOT EXISTS schedule_day_memos (
  date        date PRIMARY KEY,
  memo        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION schedule_update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS schedule_entries_updated_at ON schedule_entries;
CREATE TRIGGER schedule_entries_updated_at
  BEFORE UPDATE ON schedule_entries
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();
DROP TRIGGER IF EXISTS schedule_day_memos_updated_at ON schedule_day_memos;
CREATE TRIGGER schedule_day_memos_updated_at
  BEFORE UPDATE ON schedule_day_memos
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

-- 作業員連絡先（通知用）
CREATE TABLE IF NOT EXISTS worker_contacts (
  worker_name text PRIMARY KEY,
  email       text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE worker_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_worker_contacts" ON worker_contacts;
CREATE POLICY "auth_users_worker_contacts" ON worker_contacts
  FOR ALL USING (auth.role() = 'authenticated');

-- RLS（認証ユーザーのみ操作可）
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_day_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_users_schedule_entries" ON schedule_entries;
CREATE POLICY "auth_users_schedule_entries" ON schedule_entries
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth_users_schedule_workers" ON schedule_workers;
CREATE POLICY "auth_users_schedule_workers" ON schedule_workers
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth_users_schedule_day_memos" ON schedule_day_memos;
CREATE POLICY "auth_users_schedule_day_memos" ON schedule_day_memos
  FOR ALL USING (auth.role() = 'authenticated');
