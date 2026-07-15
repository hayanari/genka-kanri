-- ================================================================
-- 横断工程表: カスタムマーク定義 + セル付箋
-- Supabase SQL Editor で実行（cross_schedule.sql 適用後）
-- ================================================================

-- 会社ごとのマーク（セル入力項目）。既定セットはアプリ側 DEFAULT とマージする
CREATE TABLE IF NOT EXISTS cross_schedule_marks (
  id          text PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  char        text NOT NULL,
  label       text NOT NULL DEFAULT '',
  bg          text NOT NULL DEFAULT '#fff9c4',
  fg          text NOT NULL DEFAULT '#5d4037',
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, char)
);
CREATE INDEX IF NOT EXISTS cross_schedule_marks_company_idx
  ON cross_schedule_marks (company_id, sort_order);

-- セル上の付箋（メモ）。row×date に紐づき、相対オフセットで自由配置
CREATE TABLE IF NOT EXISTS cross_schedule_stickies (
  id          text PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  row_id      text NOT NULL REFERENCES cross_schedule_rows(id) ON DELETE CASCADE,
  date        date NOT NULL,
  body        text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#fff59d',
  offset_x    int  NOT NULL DEFAULT 10,
  offset_y    int  NOT NULL DEFAULT 10,
  z_index     int  NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cross_schedule_stickies_company_date_idx
  ON cross_schedule_stickies (company_id, date);
CREATE INDEX IF NOT EXISTS cross_schedule_stickies_row_idx
  ON cross_schedule_stickies (row_id);

DROP TRIGGER IF EXISTS cross_schedule_marks_updated_at ON cross_schedule_marks;
CREATE TRIGGER cross_schedule_marks_updated_at
  BEFORE UPDATE ON cross_schedule_marks
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

DROP TRIGGER IF EXISTS cross_schedule_stickies_updated_at ON cross_schedule_stickies;
CREATE TRIGGER cross_schedule_stickies_updated_at
  BEFORE UPDATE ON cross_schedule_stickies
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE cross_schedule_marks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_schedule_stickies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cross_schedule_marks_company" ON cross_schedule_marks;
CREATE POLICY "cross_schedule_marks_company" ON cross_schedule_marks
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "cross_schedule_stickies_company" ON cross_schedule_stickies;
CREATE POLICY "cross_schedule_stickies_company" ON cross_schedule_stickies
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
