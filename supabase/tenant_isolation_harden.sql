-- ================================================================
-- テナント分離の強化（無料・必須）
-- Supabase SQL Editor で実行してください
-- ================================================================

-- 1) 原価JSON: 未所属ユーザーが tokito/default を読める例外を撤廃
DROP POLICY IF EXISTS "genka_kanri_data_company" ON genka_kanri_data;
CREATE POLICY "genka_kanri_data_company" ON genka_kanri_data
  FOR ALL
  USING (id = public.current_company_id()::text)
  WITH CHECK (id = public.current_company_id()::text);

-- 2) companies: 自社のみ閲覧（一覧漏洩防止）
DROP POLICY IF EXISTS "auth_users_companies_select" ON companies;
CREATE POLICY "companies_own_select" ON companies
  FOR SELECT
  USING (id = public.current_company_id());

-- 3) company_users: 自社メンバーのみ閲覧（メール横断漏洩防止）
DROP POLICY IF EXISTS "auth_users_company_users_select" ON company_users;
CREATE POLICY "company_users_own_select" ON company_users
  FOR SELECT
  USING (company_id = public.current_company_id());

-- 4) platform_owners: 自分の行だけ（システムオーナー判定用）
ALTER TABLE IF EXISTS platform_owners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_owners_select_own" ON platform_owners;
DROP POLICY IF EXISTS "auth_users_platform_owners_select" ON platform_owners;
CREATE POLICY "platform_owners_select_own" ON platform_owners
  FOR SELECT
  USING (user_id = auth.uid());

-- 5) 企業申込: 一般ユーザーからは読めない（service_role / 管理APIのみ）
ALTER TABLE IF EXISTS company_signup_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_signup_no_client" ON company_signup_requests;
-- ポリシーを1つも付けない + RLS ON = authenticated は拒否、service_role はバイパス
-- （明示的に全拒否ポリシーは不要。INSERT もクライアントからは不可）

-- 6) process_meeting_meta も自社のみ（念のため再掲）
DROP POLICY IF EXISTS "process_meeting_meta_company" ON process_meeting_meta;
CREATE POLICY "process_meeting_meta_company" ON process_meeting_meta
  FOR ALL
  USING (id = public.current_company_id()::text)
  WITH CHECK (id = public.current_company_id()::text);
