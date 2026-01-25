create extension if not exists pgcrypto;

alter table if exists public.settings
  add column if not exists stock_alert_enabled boolean not null default false;

alter table if exists public.settings
  add column if not exists stock_alert_on_change boolean not null default false;

alter table if exists public.settings
  add column if not exists bsr_alert_enabled boolean not null default false;

alter table if exists public.settings
  add column if not exists bsr_alert_threshold_pct numeric(6,2) not null default 20;

create table if not exists public.email_alert_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asin text,
  alert_type text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_email_alert_log_user_dedupe
  on public.email_alert_log(user_id, dedupe_key);

create index if not exists idx_email_alert_log_user_dedupe_created
  on public.email_alert_log(user_id, dedupe_key, created_at desc);

alter table public.email_alert_log enable row level security;

do $$ begin
  create policy "email_alert_log_select_own" on public.email_alert_log
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "email_alert_log_insert_own" on public.email_alert_log
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
