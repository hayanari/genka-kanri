-- 案件管理 テーブル定義
-- Supabase ダッシュボードの SQL Editor で実行してください

create table if not exists genka_kanri_data (
  id text primary key default 'default',
  data jsonb not null default '{"projects":[],"costs":[],"quantities":[]}'::jsonb,
  updated_at timestamptz default now()
);

-- 初期レコードを挿入
insert into genka_kanri_data (id, data)
values ('default', '{"projects":[],"costs":[],"quantities":[]}'::jsonb)
on conflict (id) do nothing;

-- RLS: すべての操作を許可（ログイン任意・データ復旧用）
-- ※厳密な認証が必要な場合は auth.role() = 'authenticated' に変更
alter table genka_kanri_data enable row level security;
drop policy if exists "Authenticated only" on genka_kanri_data;
create policy "Allow all on genka_kanri_data" on genka_kanri_data for all using (true) with check (true);
