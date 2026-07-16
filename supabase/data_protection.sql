-- ================================================================
-- 商業向けデータ保護（空上書き拒否・自動スナップショット）
-- Supabase SQL Editor で実行してください
-- ================================================================

-- バックアップ種別
ALTER TABLE genka_kanri_backups
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual';

ALTER TABLE genka_kanri_backups
  DROP CONSTRAINT IF EXISTS genka_kanri_backups_kind_check;

ALTER TABLE genka_kanri_backups
  ADD CONSTRAINT genka_kanri_backups_kind_check
  CHECK (kind IN ('manual', 'auto', 'daily', 'pre_write', 'pre_restore'));

CREATE INDEX IF NOT EXISTS idx_genka_kanri_backups_company_kind_created
  ON genka_kanri_backups (company_id, kind, created_at DESC);

-- ----------------------------------------------------------------
-- 案件件数ヘルパー
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.genka_project_count(payload jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN payload IS NULL OR payload = '{}'::jsonb THEN 0
    WHEN jsonb_typeof(payload->'projects') = 'array' THEN jsonb_array_length(payload->'projects')
    ELSE 0
  END;
$$;

-- ----------------------------------------------------------------
-- UPDATE 前: 破壊的上書きを拒否 + 変更前スナップショット
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_genka_kanri_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_projects integer;
  new_projects integer;
  company_uuid uuid;
  allow_destructive boolean;
  recent_exists boolean;
BEGIN
  allow_destructive := current_setting('app.allow_destructive', true) = 'on';

  old_projects := public.genka_project_count(OLD.data);
  new_projects := public.genka_project_count(NEW.data);

  IF NOT allow_destructive THEN
    -- 空（{} または projects なし/0件）で既存を潰さない
    IF old_projects >= 3 AND new_projects = 0 THEN
      RAISE EXCEPTION
        'DATA_PROTECTION: % 件の案件を空データで上書きできません', old_projects
        USING ERRCODE = 'check_violation';
    END IF;

    -- 急減（10件以上あるのに 30%未満へ）を拒否
    IF old_projects >= 10 AND new_projects * 10 < old_projects * 3 THEN
      RAISE EXCEPTION
        'DATA_PROTECTION: 案件の急減（% → %）を拒否しました。設定のバックアップから復元してください',
        old_projects, new_projects
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 変更前スナップショット（内容があるとき）
  IF OLD.data IS DISTINCT FROM NEW.data AND old_projects > 0 THEN
    BEGIN
      company_uuid := OLD.id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      company_uuid := NULL;
    END;

    IF company_uuid IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM genka_kanri_backups b
        WHERE b.company_id = company_uuid
          AND b.kind = 'pre_write'
          AND b.created_at > now() - interval '30 minutes'
      ) INTO recent_exists;

      -- 件数減少時は必ず残す。それ以外は30分に1回まで
      IF (new_projects < old_projects) OR (NOT recent_exists) THEN
        INSERT INTO genka_kanri_backups (company_id, data, created_by, kind)
        VALUES (company_uuid, OLD.data, 'system:pre_write', 'pre_write');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_genka_kanri_data ON genka_kanri_data;
CREATE TRIGGER trg_protect_genka_kanri_data
  BEFORE UPDATE ON genka_kanri_data
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_genka_kanri_data();

-- ----------------------------------------------------------------
-- 復元用（破壊ガードを一時解除。service_role からのみ実行）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_genka_data_restore(
  p_company_id text,
  p_data jsonb,
  p_actor text DEFAULT 'system:restore'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_uuid uuid;
  current_data jsonb;
BEGIN
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'restore payload is null';
  END IF;

  SELECT data INTO current_data
  FROM genka_kanri_data
  WHERE id = p_company_id;

  BEGIN
    company_uuid := p_company_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    company_uuid := NULL;
  END;

  IF company_uuid IS NOT NULL AND current_data IS NOT NULL
     AND public.genka_project_count(current_data) > 0 THEN
    INSERT INTO genka_kanri_backups (company_id, data, created_by, kind)
    VALUES (company_uuid, current_data, p_actor, 'pre_restore');
  END IF;

  PERFORM set_config('app.allow_destructive', 'on', true);

  INSERT INTO genka_kanri_data (id, data, updated_at)
  VALUES (p_company_id, p_data, now())
  ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_genka_data_restore(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_genka_data_restore(text, jsonb, text) TO service_role;

-- ----------------------------------------------------------------
-- 古い自動バックアップの整理（cron から呼ぶ）
-- pre_write: 30日超を削除（各社最新20件は残す）
-- daily: 90日超を削除（各社最新60件は残す）
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_genka_backups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_pre integer := 0;
  deleted_daily integer := 0;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY company_id ORDER BY created_at DESC) AS rn,
           created_at
    FROM genka_kanri_backups
    WHERE kind = 'pre_write'
  ),
  doomed AS (
    SELECT id FROM ranked
    WHERE rn > 20 OR created_at < now() - interval '30 days'
  )
  DELETE FROM genka_kanri_backups b
  USING doomed d
  WHERE b.id = d.id;
  GET DIAGNOSTICS deleted_pre = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY company_id ORDER BY created_at DESC) AS rn,
           created_at
    FROM genka_kanri_backups
    WHERE kind = 'daily'
  ),
  doomed AS (
    SELECT id FROM ranked
    WHERE rn > 60 OR created_at < now() - interval '90 days'
  )
  DELETE FROM genka_kanri_backups b
  USING doomed d
  WHERE b.id = d.id;
  GET DIAGNOSTICS deleted_daily = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_pre_write', deleted_pre,
    'deleted_daily', deleted_daily
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_genka_backups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_genka_backups() TO service_role;
