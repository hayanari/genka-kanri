-- ================================================================
-- 横断工程表: 期間バー・工種マスタ・業者色
-- Supabase SQL Editor で実行してください
-- ================================================================

-- 行に業者色を追加
ALTER TABLE cross_schedule_rows
  ADD COLUMN IF NOT EXISTS crew_color text NOT NULL DEFAULT '';

COMMENT ON COLUMN cross_schedule_rows.crew_color IS
  '施工班・協力業者の固定色（例: #1565c0）。空なら自動割当';

-- 工種マスタ（調査・処理・管更生など）
CREATE TABLE IF NOT EXISTS cross_schedule_work_kinds (
  id          text PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  kind_key    text NOT NULL DEFAULT '',
  label       text NOT NULL,
  color       text NOT NULL DEFAULT '#90caf9',
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_schedule_work_kinds_company_label_uidx UNIQUE (company_id, label)
);
CREATE INDEX IF NOT EXISTS cross_schedule_work_kinds_company_idx
  ON cross_schedule_work_kinds (company_id, sort_order);

-- 期間バー（開始日〜終了日の帯）
CREATE TABLE IF NOT EXISTS cross_schedule_bars (
  id            text PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  row_id        text NOT NULL REFERENCES cross_schedule_rows(id) ON DELETE CASCADE,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  work_kind_id  text NOT NULL DEFAULT '',
  label         text NOT NULL DEFAULT '',
  note          text NOT NULL DEFAULT '',
  planned_days  int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_schedule_bars_date_ok CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS cross_schedule_bars_company_row_idx
  ON cross_schedule_bars (company_id, row_id);
CREATE INDEX IF NOT EXISTS cross_schedule_bars_company_dates_idx
  ON cross_schedule_bars (company_id, start_date, end_date);

DROP TRIGGER IF EXISTS cross_schedule_work_kinds_updated_at ON cross_schedule_work_kinds;
CREATE TRIGGER cross_schedule_work_kinds_updated_at
  BEFORE UPDATE ON cross_schedule_work_kinds
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

DROP TRIGGER IF EXISTS cross_schedule_bars_updated_at ON cross_schedule_bars;
CREATE TRIGGER cross_schedule_bars_updated_at
  BEFORE UPDATE ON cross_schedule_bars
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE cross_schedule_work_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_schedule_bars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cross_schedule_work_kinds_company" ON cross_schedule_work_kinds;
CREATE POLICY "cross_schedule_work_kinds_company" ON cross_schedule_work_kinds
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "cross_schedule_bars_company" ON cross_schedule_bars;
CREATE POLICY "cross_schedule_bars_company" ON cross_schedule_bars
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
