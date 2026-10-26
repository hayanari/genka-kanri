-- ================================================================
-- 領収書・請求書添付（receipts バケット）の会社分離（必須）
-- Supabase SQL Editor で実行してください
-- multi_tenant.sql の実行後に実行すること（current_company_id() を使うため）
--
-- 保存パス:
--   新: {company_id}/costs/{costId}/{file}  → 自社フォルダのみ許可
--   旧: costs/{costId}/{file}（会社ID導入前） → 自社の原価データに
--       その添付パスが登録されている場合のみ閲覧・削除を許可
-- ================================================================

CREATE OR REPLACE FUNCTION public.can_access_receipt(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_company_id() IS NULL THEN false
    WHEN split_part(object_name, '/', 1) = public.current_company_id()::text THEN true
    WHEN split_part(object_name, '/', 1) = 'costs' THEN EXISTS (
      SELECT 1
      FROM public.genka_kanri_data g
      WHERE g.id = public.current_company_id()::text
        AND jsonb_path_exists(
          g.data,
          '$.costs[*].attachments[*] ? (@.path == $p)',
          jsonb_build_object('p', object_name)
        )
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_access_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_receipt(text) TO authenticated;

DROP POLICY IF EXISTS "auth_receipts_select" ON storage.objects;
CREATE POLICY "auth_receipts_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND public.can_access_receipt(name)
  );

-- 新規アップロードは自社フォルダのみ（旧パスへの追加は不可）
DROP POLICY IF EXISTS "auth_receipts_insert" ON storage.objects;
CREATE POLICY "auth_receipts_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

DROP POLICY IF EXISTS "auth_receipts_delete" ON storage.objects;
CREATE POLICY "auth_receipts_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND public.can_access_receipt(name)
  );
