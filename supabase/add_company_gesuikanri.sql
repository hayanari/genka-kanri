-- ================================================================
-- 会社追加: 下水管理興業（gesuikanri）
-- 実行先: app genka kanri（tokito 本番）の SQL Editor
-- ================================================================

INSERT INTO companies (id, company_code, name, allow_legacy_email_login)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'gesuikanri',
  '下水管理興業',
  true
)
ON CONFLICT (company_code) DO UPDATE
SET
  name = EXCLUDED.name,
  allow_legacy_email_login = EXCLUDED.allow_legacy_email_login;

-- 空の案件データ行（移行スクリプトが上書きする）
INSERT INTO genka_kanri_data (id, data, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '{}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO process_meeting_meta (id, hidden_project_ids, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '{}',
  now()
)
ON CONFLICT (id) DO NOTHING;
