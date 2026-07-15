-- 横断工程表セルに、マークとは独立した色を持たせる
-- Supabase SQL Editor で実行

ALTER TABLE cross_schedule_cells
  ADD COLUMN IF NOT EXISTS color_bg text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color_fg text NOT NULL DEFAULT '';

COMMENT ON COLUMN cross_schedule_cells.color_bg IS 'セル背景色（空ならマーク既定色など）';
COMMENT ON COLUMN cross_schedule_cells.color_fg IS 'セル文字色';
