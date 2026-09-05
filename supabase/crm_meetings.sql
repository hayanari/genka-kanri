-- ================================================================
-- CRM: 会議メモ（複数社・複数担当者）＋ 音声/文字起こし ＋ 下書き/確定
-- supabase/crm.sql, supabase/crm_contacts.sql 実行済みの環境で追加実行
-- ================================================================

-- ---------------------------------------------------------------
-- 1. contact_logs 拡張
-- ---------------------------------------------------------------
ALTER TABLE contact_logs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'memo',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS transcript text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audio_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audio_name text NOT NULL DEFAULT '';

ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS contact_logs_kind_check;
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_kind_check CHECK (kind IN ('memo', 'meeting'));

ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS contact_logs_status_check;
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_status_check CHECK (status IN ('draft', 'confirmed'));

-- 会議形式（オンライン）を追加
ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS contact_logs_contact_type_check;
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_contact_type_check
  CHECK (contact_type IN ('電話', '対面', 'オンライン', 'メール', 'その他'));

CREATE INDEX IF NOT EXISTS contact_logs_company_kind_status_idx
  ON contact_logs (company_id, kind, status);

-- ---------------------------------------------------------------
-- 2. 出席者（会社 × 担当者）多対多
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_log_attendees (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id),
  contact_log_id     uuid NOT NULL REFERENCES contact_logs(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_person_id  uuid REFERENCES customer_contacts(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- contact_person_id が NULL の行も重複させない
CREATE UNIQUE INDEX IF NOT EXISTS contact_log_attendees_uniq
  ON contact_log_attendees (
    contact_log_id,
    customer_id,
    COALESCE(contact_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS contact_log_attendees_customer_idx
  ON contact_log_attendees (company_id, customer_id);
CREATE INDEX IF NOT EXISTS contact_log_attendees_log_idx
  ON contact_log_attendees (contact_log_id);

ALTER TABLE contact_log_attendees ENABLE ROW LEVEL SECURITY;

-- 親メモが見える人だけ出席者も見える（contact_logs の RLS がサブクエリに適用される）
DROP POLICY IF EXISTS "contact_log_attendees_select" ON contact_log_attendees;
CREATE POLICY "contact_log_attendees_select" ON contact_log_attendees
  FOR SELECT
  USING (
    company_id = public.current_company_id()
    AND EXISTS (
      SELECT 1 FROM contact_logs cl WHERE cl.id = contact_log_attendees.contact_log_id
    )
  );

DROP POLICY IF EXISTS "contact_log_attendees_insert" ON contact_log_attendees;
CREATE POLICY "contact_log_attendees_insert" ON contact_log_attendees
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
    AND EXISTS (
      SELECT 1 FROM contact_logs cl
      WHERE cl.id = contact_log_attendees.contact_log_id
        AND cl.company_id = public.current_company_id()
        AND (cl.created_by = auth.uid() OR public.is_company_executive())
    )
  );

DROP POLICY IF EXISTS "contact_log_attendees_delete" ON contact_log_attendees;
CREATE POLICY "contact_log_attendees_delete" ON contact_log_attendees
  FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
    AND EXISTS (
      SELECT 1 FROM contact_logs cl
      WHERE cl.id = contact_log_attendees.contact_log_id
        AND cl.company_id = public.current_company_id()
        AND (cl.created_by = auth.uid() OR public.is_company_executive())
    )
  );

-- 既存メモの主顧客・担当者を出席者へ移行（複製しない）
INSERT INTO contact_log_attendees (company_id, contact_log_id, customer_id, contact_person_id)
SELECT cl.company_id, cl.id, cl.customer_id, cl.contact_person_id
FROM contact_logs cl
WHERE NOT EXISTS (
  SELECT 1 FROM contact_log_attendees a
  WHERE a.contact_log_id = cl.id
    AND a.customer_id = cl.customer_id
    AND COALESCE(a.contact_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(cl.contact_person_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ---------------------------------------------------------------
-- 3. 音声ファイル用ストレージ（Plaud 等の録音・書き起こし）
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-audio', 'crm-audio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_crm_audio_select" ON storage.objects;
CREATE POLICY "auth_crm_audio_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'crm-audio'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );
DROP POLICY IF EXISTS "auth_crm_audio_insert" ON storage.objects;
CREATE POLICY "auth_crm_audio_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'crm-audio'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );
DROP POLICY IF EXISTS "auth_crm_audio_delete" ON storage.objects;
CREATE POLICY "auth_crm_audio_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'crm-audio'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- ---------------------------------------------------------------
-- 4. 検索インデックス（文字起こしも検索対象）
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS contact_logs_transcript_trgm
  ON contact_logs USING gin (transcript gin_trgm_ops);

COMMENT ON COLUMN contact_logs.kind IS 'memo=1対1メモ / meeting=会議（複数社・複数担当者）';
COMMENT ON COLUMN contact_logs.status IS 'draft=下書き（未確認） / confirmed=確定';
COMMENT ON COLUMN contact_logs.transcript IS '文字起こし原文（Plaud等）。body は整形済み議事録';
COMMENT ON COLUMN contact_logs.audio_path IS 'crm-audio バケット内パス（company_id/contact_logs/...）';
COMMENT ON TABLE contact_log_attendees IS '会議メモの出席者（会社×担当者）。主顧客 contact_logs.customer_id も含める';
