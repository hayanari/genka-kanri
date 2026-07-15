-- 作業員マスタに退職日（この日以降は空き・選択肢に出さない）
ALTER TABLE schedule_workers
  ADD COLUMN IF NOT EXISTS left_at date;

COMMENT ON COLUMN schedule_workers.left_at IS '退職日。この日付以降はスケジュールの空き・新規割当候補に表示しない';
