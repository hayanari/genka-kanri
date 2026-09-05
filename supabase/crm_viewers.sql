-- ================================================================
-- CRM: メモごとに「追加で閲覧を許可するスタッフ」を指定できるようにする
-- supabase/crm.sql, crm_contacts.sql, crm_meetings.sql 実行済みの環境で追加実行
--
-- 公開範囲（全社 / 役員のみ / 自分のみ）に加え、指定したスタッフにも見せる。
-- 例: 「自分のみ」+ 田中 → 作成者と田中だけが閲覧できる
-- ================================================================

CREATE TABLE IF NOT EXISTS contact_log_viewers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id),
  contact_log_id  uuid NOT NULL REFERENCES contact_logs(id) ON DELETE CASCADE,
  -- company_users.user_id は UNIQUE。表示名を join するため company_users を参照する
  user_id         uuid NOT NULL REFERENCES company_users(user_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_log_viewers_uniq UNIQUE (contact_log_id, user_id)
);

CREATE INDEX IF NOT EXISTS contact_log_viewers_user_idx
  ON contact_log_viewers (user_id, contact_log_id);
CREATE INDEX IF NOT EXISTS contact_log_viewers_log_idx
  ON contact_log_viewers (contact_log_id);

-- RLS の相互参照（contact_logs ⇄ contact_log_viewers）による無限再帰を避けるため
-- 判定は SECURITY DEFINER 関数で行う
CREATE OR REPLACE FUNCTION public.is_contact_log_viewer(p_log_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_log_viewers v
    WHERE v.contact_log_id = p_log_id
      AND v.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_contact_log_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_contact_log_viewer(uuid) TO authenticated;

-- contact_logs の閲覧ポリシーに「指定スタッフ」を追加
DROP POLICY IF EXISTS "contact_logs_select" ON contact_logs;
CREATE POLICY "contact_logs_select" ON contact_logs
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND (
      created_by = auth.uid()
      OR visibility = 'company'
      OR (visibility = 'executive' AND public.is_company_executive())
      OR public.is_contact_log_viewer(id)
    )
  );

ALTER TABLE contact_log_viewers ENABLE ROW LEVEL SECURITY;

-- 親メモが見える人は閲覧許可リストも見える
DROP POLICY IF EXISTS "contact_log_viewers_select" ON contact_log_viewers;
CREATE POLICY "contact_log_viewers_select" ON contact_log_viewers
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND EXISTS (
      SELECT 1 FROM contact_logs cl WHERE cl.id = contact_log_viewers.contact_log_id
    )
  );

-- 作成者または役員だけが許可リストを変更できる
DROP POLICY IF EXISTS "contact_log_viewers_insert" ON contact_log_viewers;
CREATE POLICY "contact_log_viewers_insert" ON contact_log_viewers
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
    AND EXISTS (
      SELECT 1 FROM company_users cu
      WHERE cu.user_id = contact_log_viewers.user_id
        AND cu.company_id = public.current_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM contact_logs cl
      WHERE cl.id = contact_log_viewers.contact_log_id
        AND cl.company_id = public.current_company_id()
        AND (cl.created_by = auth.uid() OR public.is_company_executive())
    )
  );

DROP POLICY IF EXISTS "contact_log_viewers_delete" ON contact_log_viewers;
CREATE POLICY "contact_log_viewers_delete" ON contact_log_viewers
  FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
    AND EXISTS (
      SELECT 1 FROM contact_logs cl
      WHERE cl.id = contact_log_viewers.contact_log_id
        AND cl.company_id = public.current_company_id()
        AND (cl.created_by = auth.uid() OR public.is_company_executive())
    )
  );

COMMENT ON TABLE contact_log_viewers IS
  '商談メモの追加閲覧者。公開範囲に加えて、指定したスタッフも閲覧できる';
