-- ================================================================
-- 機能追加 2026-06: 権限管理・変更履歴・領収書添付
-- Supabase の SQL Editor で1回実行してください
-- 既存テーブル・既存データには一切変更を加えません（新規追加のみ）
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ユーザー権限（閲覧のみ / 入力可 / 管理者）
--    行が無いユーザーは「入力可（editor）」として扱われます
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  email       text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'admin')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_user_roles" ON user_roles;
CREATE POLICY "auth_users_user_roles" ON user_roles
  FOR ALL USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------
-- 2. 変更履歴（監査ログ）
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_email  text NOT NULL DEFAULT '',
  action      text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_audit_logs" ON audit_logs;
CREATE POLICY "auth_users_audit_logs" ON audit_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- ----------------------------------------------------------------
-- 3. 領収書・請求書の写真添付用ストレージバケット
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_receipts_select" ON storage.objects;
CREATE POLICY "auth_receipts_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth_receipts_insert" ON storage.objects;
CREATE POLICY "auth_receipts_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "auth_receipts_delete" ON storage.objects;
CREATE POLICY "auth_receipts_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'receipts' AND auth.role() = 'authenticated');
