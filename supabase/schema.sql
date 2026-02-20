-- 工事原価管理 テーブル定義
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

-- RLS: ログイン済みユーザーのみアクセス可能
alter table genka_kanri_data enable row level security;
drop policy if exists "Allow all on genka_kanri_data" on genka_kanri_data;
create policy "Authenticated only" on genka_kanri_data for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
