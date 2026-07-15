-- ================================================================
-- 商用権限: システムオーナー（全社横断）+ 会社ごとの管理者
-- app genka kanri の SQL Editor で実行
-- ================================================================

-- 会社内ロール
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS role text;

UPDATE company_users
SET role = 'editor'
WHERE role IS NULL;

ALTER TABLE company_users
  ALTER COLUMN role SET DEFAULT 'editor';

ALTER TABLE company_users
  DROP CONSTRAINT IF EXISTS company_users_role_check;

ALTER TABLE company_users
  ADD CONSTRAINT company_users_role_check
  CHECK (role IN ('viewer', 'editor', 'admin', 'owner'));

ALTER TABLE company_users
  ALTER COLUMN role SET NOT NULL;

-- 旧 user_roles を会社所属へ移行
UPDATE company_users cu
SET role = CASE
  WHEN ur.role IN ('viewer', 'editor', 'admin') THEN ur.role
  ELSE cu.role
END
FROM user_roles ur
WHERE lower(cu.auth_email) = lower(ur.email);

-- システムオーナー（全会社横断）
CREATE TABLE IF NOT EXISTS platform_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_owners_email_key UNIQUE (email)
);

ALTER TABLE platform_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_owners_select_authenticated" ON platform_owners;
CREATE POLICY "platform_owners_select_authenticated" ON platform_owners
  FOR SELECT USING (auth.role() = 'authenticated');

-- 初期システムオーナー
INSERT INTO platform_owners (user_id, email)
SELECT id, lower(email)
FROM auth.users
WHERE lower(email) = 'tokito@tokito-co.jp'
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

-- 参照用
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_owners WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_company_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.company_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
REVOKE ALL ON FUNCTION public.current_company_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_role() TO authenticated;

-- 下水（gesuikanri）の会社オーナー例（メールを実在ユーザーに合わせて実行）
-- UPDATE company_users cu
-- SET role = 'owner'
-- FROM companies c
-- WHERE cu.company_id = c.id
--   AND c.company_code = 'gesuikanri'
--   AND lower(cu.auth_email) = 'otagiri@gesuikanri.co.jp';

-- 時任の会社オーナー例（システムオーナーとは別に、会社管理者も付けられる）
-- UPDATE company_users cu
-- SET role = 'owner'
-- FROM companies c
-- WHERE cu.company_id = c.id
--   AND c.company_code = 'tokito'
--   AND lower(cu.auth_email) = 'tokito@tokito-co.jp';

