-- ================================================================
-- 見積書（案件管理）: 本体・明細・履歴
-- Supabase SQL Editor で実行してください
-- ================================================================

CREATE TABLE IF NOT EXISTS estimates (
  id              text PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES public.companies(id),
  project_id      text NOT NULL,
  estimate_no     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'confirmed', 'lost')),
  issue_date      date,
  client_name     text NOT NULL DEFAULT '',
  work_name       text NOT NULL DEFAULT '',
  site_location   text NOT NULL DEFAULT '',
  valid_period    text NOT NULL DEFAULT '',
  notes           text NOT NULL DEFAULT '',
  tax_rate        numeric NOT NULL DEFAULT 10,
  subtotal        numeric NOT NULL DEFAULT 0,
  tax_amount      numeric NOT NULL DEFAULT 0,
  total_amount    numeric NOT NULL DEFAULT 0,
  issuer          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_email text NOT NULL DEFAULT '',
  created_by_name  text NOT NULL DEFAULT '',
  updated_by_email text NOT NULL DEFAULT '',
  updated_by_name  text NOT NULL DEFAULT '',
  confirmed_at    timestamptz,
  confirmed_by_email text NOT NULL DEFAULT '',
  confirmed_by_name  text NOT NULL DEFAULT '',
  lost_at         timestamptz,
  lost_by_email   text NOT NULL DEFAULT '',
  lost_by_name    text NOT NULL DEFAULT '',
  lost_reason     text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimates_company_project_idx
  ON estimates (company_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS estimates_company_status_idx
  ON estimates (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS estimate_items (
  id           text PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  estimate_id  text NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  section      text NOT NULL DEFAULT '',
  kind         text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT '',
  spec         text NOT NULL DEFAULT '',
  quantity     numeric NOT NULL DEFAULT 0,
  unit         text NOT NULL DEFAULT '',
  unit_price   numeric NOT NULL DEFAULT 0,
  amount       numeric NOT NULL DEFAULT 0,
  note         text NOT NULL DEFAULT '',
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx
  ON estimate_items (company_id, estimate_id, sort_order);

CREATE TABLE IF NOT EXISTS estimate_events (
  id           text PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  estimate_id  text NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  action       text NOT NULL,
  actor_email  text NOT NULL DEFAULT '',
  actor_name   text NOT NULL DEFAULT '',
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_events_estimate_idx
  ON estimate_events (company_id, estimate_id, created_at DESC);

DROP TRIGGER IF EXISTS estimates_updated_at ON estimates;
CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

DROP TRIGGER IF EXISTS estimate_items_updated_at ON estimate_items;
CREATE TRIGGER estimate_items_updated_at
  BEFORE UPDATE ON estimate_items
  FOR EACH ROW EXECUTE PROCEDURE schedule_update_updated_at();

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates_company" ON estimates;
CREATE POLICY "estimates_company" ON estimates
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "estimate_items_company" ON estimate_items;
CREATE POLICY "estimate_items_company" ON estimate_items
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS "estimate_events_company" ON estimate_events;
CREATE POLICY "estimate_events_company" ON estimate_events
  FOR ALL
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
