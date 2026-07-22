-- ================================================================
-- 作業員マスタ: 自社スタッフ / 協力業者 区分
-- Supabase SQL Editor で実行してください
-- ================================================================

ALTER TABLE schedule_workers
  ADD COLUMN IF NOT EXISTS kind text;

UPDATE schedule_workers
SET kind = 'staff'
WHERE kind IS NULL OR kind = '';

ALTER TABLE schedule_workers
  ALTER COLUMN kind SET DEFAULT 'staff';

ALTER TABLE schedule_workers
  DROP CONSTRAINT IF EXISTS schedule_workers_kind_check;

ALTER TABLE schedule_workers
  ADD CONSTRAINT schedule_workers_kind_check
  CHECK (kind IN ('staff', 'partner'));

ALTER TABLE schedule_workers
  ALTER COLUMN kind SET NOT NULL;

COMMENT ON COLUMN schedule_workers.kind IS
  'staff=自社（人工転記対象） / partner=協力業者（スケジュール配置のみ・人工転記しない）';
