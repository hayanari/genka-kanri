-- ================================================================
-- CRM: 顧客（会社）の下に担当者を紐づける
-- supabase/crm.sql 実行済みの環境で追加実行
-- ================================================================

CREATE TABLE IF NOT EXISTS customer_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name         text NOT NULL,
  title        text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  note         text NOT NULL DEFAULT '',
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
  ON customer_contacts (company_id, customer_id, sort_order, name);

DROP TRIGGER IF EXISTS customer_contacts_updated_at ON customer_contacts;
CREATE TRIGGER customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_contacts_select" ON customer_contacts;
CREATE POLICY "customer_contacts_select" ON customer_contacts
  FOR SELECT
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "customer_contacts_insert" ON customer_contacts;
CREATE POLICY "customer_contacts_insert" ON customer_contacts
  FOR INSERT
  WITH CHECK (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  );

DROP POLICY IF EXISTS "customer_contacts_update" ON customer_contacts;
CREATE POLICY "customer_contacts_update" ON customer_contacts
  FOR UPDATE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  )
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "customer_contacts_delete" ON customer_contacts;
CREATE POLICY "customer_contacts_delete" ON customer_contacts
  FOR DELETE
  USING (
    company_id = public.current_company_id()
    AND COALESCE(public.current_company_role(), 'viewer') <> 'viewer'
  );

-- 既存の customers.contact_person などを担当者行へ移行（重複防止）
INSERT INTO customer_contacts (company_id, customer_id, name, phone, email, note, sort_order)
SELECT
  c.company_id,
  c.id,
  NULLIF(trim(c.contact_person), ''),
  COALESCE(c.phone, ''),
  COALESCE(c.email, ''),
  '顧客マスタから移行',
  0
FROM customers c
WHERE NULLIF(trim(c.contact_person), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customer_contacts cc
    WHERE cc.customer_id = c.id
      AND cc.name = trim(c.contact_person)
  );

-- 商談メモに担当者紐づけ（任意）
ALTER TABLE contact_logs
  ADD COLUMN IF NOT EXISTS contact_person_id uuid REFERENCES customer_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contact_logs_contact_person_idx
  ON contact_logs (contact_person_id)
  WHERE contact_person_id IS NOT NULL;

COMMENT ON TABLE customer_contacts IS '顧客（会社）配下の担当者';
