-- ================================================================
-- CRM: 顧客マスタ・商談メモ・閲覧ログ + RLS + 日本語検索
-- Supabase SQL Editor で実行してください
-- ================================================================

-- 役員フラグ（機微メモの visibility=executive 用）
-- ※ 既存の company_users.role (viewer/editor/admin/owner) は維持
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS is_executive boolean NOT NULL DEFAULT false;

UPDATE company_users
SET is_executive = true
WHERE role IN ('admin', 'owner') AND is_executive = false;

CREATE OR REPLACE FUNCTION public.is_company_executive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_executive OR role IN ('admin', 'owner')
      FROM public.company_users
      WHERE user_id = auth.uid()
      LIMIT 1
    ),
    false
  )
  OR public.is_platform_owner();
$$;

REVOKE ALL ON FUNCTION public.is_company_executive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_executive() TO authenticated;

-- ---------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),
  name           text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  email          text NOT NULL DEFAULT '',
  address        text NOT NULL DEFAULT '',
  note           text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_company_name_idx
  ON customers (company_id, name);

DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers
  FOR SELECT
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  );

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers
  FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  )
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_delete" ON customers
  FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  );

-- ---------------------------------------------------------------
-- contact_logs（案件は JSONB のため project_id は text・FKなし）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_id    text NOT NULL DEFAULT '',
  contact_date  date NOT NULL DEFAULT (CURRENT_DATE),
  contact_type  text NOT NULL DEFAULT 'その他'
                  CHECK (contact_type IN ('電話', '対面', 'メール', 'その他')),
  title         text NOT NULL DEFAULT '',
  body          text NOT NULL DEFAULT '',
  visibility    text NOT NULL DEFAULT 'company'
                  CHECK (visibility IN ('company', 'executive', 'private')),
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_logs_company_customer_idx
  ON contact_logs (company_id, customer_id, contact_date DESC);
CREATE INDEX IF NOT EXISTS contact_logs_company_project_idx
  ON contact_logs (company_id, project_id)
  WHERE project_id <> '';
CREATE INDEX IF NOT EXISTS contact_logs_created_by_idx
  ON contact_logs (created_by);

DROP TRIGGER IF EXISTS contact_logs_updated_at ON contact_logs;
CREATE TRIGGER contact_logs_updated_at
  BEFORE UPDATE ON contact_logs
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE contact_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_logs_select" ON contact_logs;
CREATE POLICY "contact_logs_select" ON contact_logs
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND (
      created_by = auth.uid()
      OR visibility = 'company'
      OR (visibility = 'executive' AND public.is_company_executive())
      OR (visibility = 'private' AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "contact_logs_insert" ON contact_logs;
CREATE POLICY "contact_logs_insert" ON contact_logs
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND created_by = auth.uid()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  );

DROP POLICY IF EXISTS "contact_logs_update" ON contact_logs;
CREATE POLICY "contact_logs_update" ON contact_logs
  FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND (created_by = auth.uid() OR public.is_company_executive())
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (created_by = auth.uid() OR public.is_company_executive())
  );

DROP POLICY IF EXISTS "contact_logs_delete" ON contact_logs;
CREATE POLICY "contact_logs_delete" ON contact_logs
  FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND (created_by = auth.uid() OR public.is_company_executive())
  );

-- ---------------------------------------------------------------
-- contact_log_access_logs（役員メモの閲覧記録）
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_log_access_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id),
  contact_log_id  uuid NOT NULL REFERENCES contact_logs(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  accessed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_log_access_logs_log_idx
  ON contact_log_access_logs (contact_log_id, accessed_at DESC);

ALTER TABLE contact_log_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_log_access_insert" ON contact_log_access_logs;
CREATE POLICY "contact_log_access_insert" ON contact_log_access_logs
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM contact_logs cl
      WHERE cl.id = contact_log_id
        AND cl.company_id = public.current_company_id()
        AND cl.visibility = 'executive'
        AND (
          cl.created_by = auth.uid()
          OR public.is_company_executive()
        )
    )
  );

DROP POLICY IF EXISTS "contact_log_access_select" ON contact_log_access_logs;
CREATE POLICY "contact_log_access_select" ON contact_log_access_logs
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND public.is_company_executive()
  );

-- ---------------------------------------------------------------
-- 日本語検索インデックス
-- PGroonga が使える環境では下記を有効化（使えない場合はスキップ可）
-- ---------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgroonga;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'PGroonga unavailable: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS customers_name_pgroonga ON customers USING pgroonga (name)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS contact_logs_title_pgroonga ON contact_logs USING pgroonga (title)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS contact_logs_body_pgroonga ON contact_logs USING pgroonga (body)';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'PGroonga index skipped: %', SQLERRM;
END $$;

-- 代替: pg_trgm + GIN（Supabase 標準で利用可）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_name_trgm
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_logs_title_trgm
  ON contact_logs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_logs_body_trgm
  ON contact_logs USING gin (body gin_trgm_ops);

COMMENT ON COLUMN company_users.is_executive IS
  'CRM機微メモ（visibility=executive）を閲覧できる役員フラグ';
COMMENT ON COLUMN contact_logs.project_id IS
  '案件は genka_kanri_data JSONB のため text。空文字=未紐づけ';
COMMENT ON COLUMN contact_logs.visibility IS
  'company=全社 / executive=役員のみ / private=作成者のみ';
