-- 作業員連絡先の初期登録
-- SQL Editor で実行してください
-- 1. テーブル作成（存在しない場合）
-- 2. スケジュールで使う名前（姓）と Teams メールのマッピング
-- 3. worker_contacts の登録者を schedule_workers（スタッフ）に同期

CREATE TABLE IF NOT EXISTS worker_contacts (
  worker_name text PRIMARY KEY,
  email       text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE worker_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_users_worker_contacts" ON worker_contacts;
CREATE POLICY "auth_users_worker_contacts" ON worker_contacts
  FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO worker_contacts (worker_name, email, updated_at) VALUES
  ('松浦', 'matsuura@kktokito.onmicrosoft.com', now()),
  ('矢山', 'satoshi@kktokito.onmicrosoft.com', now()),
  ('吉村', 'yoshimura@kktokito.onmicrosoft.com', now()),
  ('河居', 'kawai@kktokito.onmicrosoft.com', now()),
  ('山城', 'yamashiro@kktokito.onmicrosoft.com', now()),
  ('市原', 'ichihara@kktokito.onmicrosoft.com', now()),
  ('宮前', 'miyamae@kktokito.onmicrosoft.com', now()),
  ('濱根', 'hamane@kktokito.onmicrosoft.com', now()),
  ('黒田', 'kuroda@kktokito.onmicrosoft.com', now()),
  ('渡辺', 'watanabe@kktokito.onmicrosoft.com', now()),
  ('光嶋', 'mitsushima@kktokito.onmicrosoft.com', now()),
  ('山本', 'yamamoto@kktokito.onmicrosoft.com', now()),
  ('西田', 'nishida@kktokito.onmicrosoft.com', now()),
  ('織田', 'oda@kktokito.onmicrosoft.com', now()),
  ('清井', 'kiyoi@kktokito.onmicrosoft.com', now()),
  ('村井', 'murai@kktokito.onmicrosoft.com', now()),
  ('西原', 'nishihara@kktokito.onmicrosoft.com', now()),
  ('大江', 'ooe@kktokito.onmicrosoft.com', now()),
  ('青木', 'aoki@kktokito.onmicrosoft.com', now()),
  ('山田', 'yamada@kktokito.onmicrosoft.com', now()),
  ('北野', 'kitano@kktokito.onmicrosoft.com', now()),
  ('平山', 'hirayama@kktokito.onmicrosoft.com', now()),
  ('土屋', 'n.tsuchiya@kktokito.onmicrosoft.com', now()),
  ('関山', 'sekiyama@kktokito.onmicrosoft.com', now()),
  ('朝日', 'asahi@kktokito.onmicrosoft.com', now()),
  ('川野', 'kawano@kktokito.onmicrosoft.com', now()),
  ('上中別府', 'uenakabeppu@kktokito.onmicrosoft.com', now())
ON CONFLICT (worker_name) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = EXCLUDED.updated_at;

-- 3. worker_contacts の登録者を schedule_workers（スタッフマスター）に同期
INSERT INTO schedule_workers (name, sort_order)
SELECT worker_name, (row_number() OVER (ORDER BY worker_name) - 1)::int
FROM worker_contacts
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order;

-- 4. worker_contacts から削除した短い表記を schedule_workers からも削除
DELETE FROM schedule_workers WHERE name IN ('朝', '土');
