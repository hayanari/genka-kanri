-- ================================================================
-- 会社の運用管理: 有効/無効フラグ
-- Supabase SQL Editor で実行してください
-- ================================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE companies
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE companies
  ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE companies
  ALTER COLUMN is_active SET NOT NULL;

COMMENT ON COLUMN companies.is_active IS
  'false のときログイン不可（データは残す。課金停止・休止用）';
