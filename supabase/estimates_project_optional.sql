-- ================================================================
-- 見積を案件化前でも使えるように project_id を任意化
-- （すでに estimates.sql 実行済みの場合、これだけ追加実行）
-- ================================================================

ALTER TABLE estimates
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE estimates
  ALTER COLUMN project_id SET DEFAULT '';

UPDATE estimates
  SET project_id = ''
  WHERE project_id IS NULL;

COMMENT ON COLUMN estimates.project_id IS
  '受注後に紐づく案件ID。空文字 = 案件化前の見積';
