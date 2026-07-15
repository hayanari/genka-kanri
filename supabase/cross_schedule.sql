-- ================================================================
-- 横断工程表（工程会議ボードの日別ビュー）
-- 行 = 案件 × 施工班、セル = 行 × 日付（マーク・スパン番号・注記）
-- Supabase SQL Editor で実行してください（multi_tenant.sql 適用後）
-- ================================================================

-- 行: 案件 × 施工班
CREATE TABLE IF NOT EXISTS cross_schedule_rows (
  id          text PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  project_id  text NOT NULL,
  crew_name   text NOT NULL DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cross_schedule_rows_company_project_idx
  ON cross_schedule_rows (company_id, project_id, sort_order);

-- セル: 行 × 日付
CREATE TABLE IF NOT EXISTS cross_schedule_cells (
  row_id      text NOT NULL REFERENCES cross_schedule_rows(id) ON DELETE CASCADE,
  date        date NOT NULL,
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  -- マーク種別（完 / 予 / 仕 / 雨 / 休 / 夜 など。自由文字も可）
  mark        text NOT NULL DEFAULT '',
  -- スパン番号などの表示テキスト（例: "12"）
  span_no     text NOT NULL DEFAULT '',
  -- セルの注記（ツールチップ表示）
  note        text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (row_id, date)
);
CREATE INDEX IF NOT EXISTS cross_schedule_cells_company_date_idx
  ON cross_schedule_cells (company_id, date);

-- updated_at 自動更新（schema.sql の関数を再利用）
DROP TRIGGER IF EXISTS cross_schedule_rows_updated_at ON cross_schedule_rows;
CREATE TRIGGER cross_schedule_rows_updated_at
  BEFORE UPDATE ON cross_schedule_rows
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

DROP TRIGGER IF EXISTS cross_schedule_cells_updated_at ON cross_schedule_cells;
CREATE TRIGGER cross_schedule_cells_updated_at
  BEFORE UPDATE ON cross_schedule_cells
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

-- RLS: 自社データのみ
ALTER TABLE cross_schedule_rows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_schedule_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cross_schedule_rows_company" ON cross_schedule_rows;
CREATE POLICY "cross_schedule_rows_company" ON cross_schedule_rows
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "cross_schedule_cells_company" ON cross_schedule_cells;
CREATE POLICY "cross_schedule_cells_company" ON cross_schedule_cells
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
