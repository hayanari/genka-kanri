-- ================================================================
-- マルチテナント（会社ID + ログインID）
-- Supabase SQL Editor で1回実行してください
-- 既存の tokito データは会社コード "tokito" に紐付けます
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- 1. 会社・所属ユーザー
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code text NOT NULL,
  name text NOT NULL,
  allow_legacy_email_login boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_company_code_key UNIQUE (company_code)
);

CREATE TABLE IF NOT EXISTS company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  login_id text NOT NULL,
  auth_email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_users_company_login_key UNIQUE (company_id, login_id),
  CONSTRAINT company_users_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS company_users_auth_email_idx ON company_users (lower(auth_email));

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_users_companies_select" ON companies;
CREATE POLICY "auth_users_companies_select" ON companies
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_users_company_users_select" ON company_users;
CREATE POLICY "auth_users_company_users_select" ON company_users
  FOR SELECT USING (auth.role() = 'authenticated');

-- 自社の TOKITO テナント（固定UUID）
INSERT INTO companies (id, company_code, name, allow_legacy_email_login)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'tokito',
  'TOKITO CORP',
  true
)
ON CONFLICT (company_code) DO UPDATE
SET
  name = EXCLUDED.name,
  allow_legacy_email_login = EXCLUDED.allow_legacy_email_login;

-- 既存の default データを会社行へ複製（既にあれば維持）
INSERT INTO genka_kanri_data (id, data, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001',
  data,
  COALESCE(updated_at, now())
FROM genka_kanri_data
WHERE id = 'default'
ON CONFLICT (id) DO NOTHING;

-- default が無い場合の空行
INSERT INTO genka_kanri_data (id, data, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. 現在ユーザーの会社ID（RLS用）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.company_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO service_role;

-- ----------------------------------------------------------------
-- 3. 各テーブルへ company_id を追加
-- ----------------------------------------------------------------
ALTER TABLE schedule_entries
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE schedule_workers
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE schedule_day_memos
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE worker_contacts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE process_meeting_rows
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE process_meeting_project_notes
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

ALTER TABLE genka_kanri_backups
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 既存行を tokito に紐付け
UPDATE schedule_entries
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE schedule_workers
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE schedule_day_memos
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE worker_contacts
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE process_meeting_rows
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE process_meeting_project_notes
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE audit_logs
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

UPDATE genka_kanri_backups
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- process_meeting_meta を会社単位IDへ
INSERT INTO process_meeting_meta (id, hidden_project_ids, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001',
  hidden_project_ids,
  COALESCE(updated_at, now())
FROM process_meeting_meta
WHERE id = 'default'
ON CONFLICT (id) DO NOTHING;

INSERT INTO process_meeting_meta (id, hidden_project_ids, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', '{}', now())
ON CONFLICT (id) DO NOTHING;

-- schedule_day_memos: PK を (company_id, date) に変更
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'schedule_day_memos' AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'schedule_day_memos_pkey'
  ) THEN
    ALTER TABLE schedule_day_memos DROP CONSTRAINT schedule_day_memos_pkey;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE schedule_day_memos
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'schedule_day_memos'
      AND constraint_name = 'schedule_day_memos_company_date_pkey'
  ) THEN
    ALTER TABLE schedule_day_memos
      ADD CONSTRAINT schedule_day_memos_company_date_pkey PRIMARY KEY (company_id, date);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- schedule_workers: 会社内で名前一意
DO $$
BEGIN
  ALTER TABLE schedule_workers DROP CONSTRAINT IF EXISTS schedule_workers_name_key;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS schedule_workers_company_name_uidx
  ON schedule_workers (company_id, name);

-- worker_contacts: 会社内で作業員名一意
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'worker_contacts' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE worker_contacts DROP CONSTRAINT worker_contacts_pkey;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE worker_contacts
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'worker_contacts'
      AND constraint_name = 'worker_contacts_company_worker_pkey'
  ) THEN
    ALTER TABLE worker_contacts
      ADD CONSTRAINT worker_contacts_company_worker_pkey PRIMARY KEY (company_id, worker_name);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- process_meeting_project_notes: 会社込みPK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'process_meeting_project_notes' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE process_meeting_project_notes DROP CONSTRAINT process_meeting_project_notes_pkey;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

ALTER TABLE process_meeting_project_notes
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'process_meeting_project_notes'
      AND constraint_name = 'process_meeting_notes_company_project_week_pkey'
  ) THEN
    ALTER TABLE process_meeting_project_notes
      ADD CONSTRAINT process_meeting_notes_company_project_week_pkey
      PRIMARY KEY (company_id, project_id, week_start);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- NOT NULL（他テーブル）
ALTER TABLE schedule_entries ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE schedule_workers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE process_meeting_rows ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS schedule_entries_company_date_idx
  ON schedule_entries (company_id, date);
CREATE INDEX IF NOT EXISTS process_meeting_rows_company_idx
  ON process_meeting_rows (company_id, project_id);

-- ----------------------------------------------------------------
-- 4. RLS を会社単位に更新（認証ユーザーは自社のみ）
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "allow_all_genka_kanri_data" ON genka_kanri_data;
DROP POLICY IF EXISTS "genka_kanri_data_company" ON genka_kanri_data;
CREATE POLICY "genka_kanri_data_company" ON genka_kanri_data
  FOR ALL
  USING (
    id = public.current_company_id()::text
    OR (public.current_company_id() IS NULL AND id IN ('default', '00000000-0000-0000-0000-000000000001'))
  )
  WITH CHECK (id = public.current_company_id()::text);

DROP POLICY IF EXISTS "allow_all_backups" ON genka_kanri_backups;
DROP POLICY IF EXISTS "backups_company" ON genka_kanri_backups;
CREATE POLICY "backups_company" ON genka_kanri_backups
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_schedule_entries" ON schedule_entries;
DROP POLICY IF EXISTS "schedule_entries_company" ON schedule_entries;
CREATE POLICY "schedule_entries_company" ON schedule_entries
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_schedule_workers" ON schedule_workers;
DROP POLICY IF EXISTS "schedule_workers_company" ON schedule_workers;
CREATE POLICY "schedule_workers_company" ON schedule_workers
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_schedule_day_memos" ON schedule_day_memos;
DROP POLICY IF EXISTS "schedule_day_memos_company" ON schedule_day_memos;
CREATE POLICY "schedule_day_memos_company" ON schedule_day_memos
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_worker_contacts" ON worker_contacts;
DROP POLICY IF EXISTS "worker_contacts_company" ON worker_contacts;
CREATE POLICY "worker_contacts_company" ON worker_contacts
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_process_meeting_rows" ON process_meeting_rows;
DROP POLICY IF EXISTS "process_meeting_rows_company" ON process_meeting_rows;
CREATE POLICY "process_meeting_rows_company" ON process_meeting_rows
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_process_meeting_meta" ON process_meeting_meta;
DROP POLICY IF EXISTS "process_meeting_meta_company" ON process_meeting_meta;
DO $$
BEGIN
  ALTER TABLE process_meeting_meta ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN
  NULL;
END $$;
CREATE POLICY "process_meeting_meta_company" ON process_meeting_meta
  FOR ALL
  USING (id = public.current_company_id()::text)
  WITH CHECK (id = public.current_company_id()::text);

DROP POLICY IF EXISTS "auth_users_process_meeting_notes" ON process_meeting_project_notes;
DROP POLICY IF EXISTS "process_meeting_notes_company" ON process_meeting_project_notes;
DO $$
BEGIN
  ALTER TABLE process_meeting_project_notes ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN
  NULL;
END $$;
CREATE POLICY "process_meeting_notes_company" ON process_meeting_project_notes
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "auth_users_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_company" ON audit_logs;
CREATE POLICY "audit_logs_company" ON audit_logs
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- ----------------------------------------------------------------
-- 5. 既存 Auth ユーザーを tokito に自動紐付け
--    ログインIDは当面メールアドレス全体（重複回避）
--    画面では会社ID=tokito / ログインID=従来メール で入れます
-- ----------------------------------------------------------------
INSERT INTO company_users (company_id, user_id, login_id, auth_email, display_name)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  lower(u.email),
  u.email,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_users cu WHERE cu.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;
