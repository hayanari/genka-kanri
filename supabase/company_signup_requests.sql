-- ================================================================
-- 企業登録申込（公開フォーム） + システムオーナー承認用テーブル
-- Supabase SQL Editor で実行してください
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

create table if not exists public.company_signup_requests (
  id uuid primary key default gen_random_uuid(),
  company_code text not null,
  company_name text not null,
  address text not null,
  phone text not null,
  contact_email text not null,
  owner_name text not null,
  owner_login_id text not null default 'admin',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by_email text,
  approved_company_id uuid references public.companies(id),
  approved_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists company_signup_pending_code_uidx
  on public.company_signup_requests (company_code)
  where status = 'pending';

create index if not exists company_signup_requests_status_created_idx
  on public.company_signup_requests (status, created_at desc);
