-- Idempotent migrations for Intelligent Notifications
-- Requires: pgcrypto extension for gen_random_uuid (available on Supabase)

-- notification_snapshots: per-ASIN daily payloads
create table if not exists public.notification_snapshots (
  id uuid primary key default gen_random_uuid(),
  asin text not null,
  user_id uuid not null,
  status text not null check (status in ('better','worse','stable')),
  net_impact numeric not null default 0,
  sentiment text not null,
  drivers jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  confidence text not null check (confidence in ('high','medium','low')),
  details jsonb not null,
  algo_version text not null default 'v1',
  created_at timestamptz not null default now()
);

-- notification_daily_rollup: daily counters and averages
create table if not exists public.notification_daily_rollup (
  id uuid primary key default gen_random_uuid(),
  asin text not null,
  user_id uuid not null,
  date date not null,
  better int not null default 0,
  worse int not null default 0,
  stable int not null default 0,
  net_impact_avg numeric not null default 0,
  -- optional weights for light auto-learning (EMA), kept as JSONB per (asin,user)
  weights jsonb
);

-- notification_feedback: user actions on notifications
create table if not exists public.notification_feedback (
  id uuid primary key default gen_random_uuid(),
  asin text not null,
  user_id uuid not null,
  notification_id uuid not null references public.notification_snapshots(id) on delete cascade,
  action text not null check (action in ('clicked','dismissed','helpful','ignored')),
  created_at timestamptz not null default now()
);

-- Indexes (idempotent)
create index if not exists idx_notification_snapshots_user on public.notification_snapshots(user_id);
create index if not exists idx_notification_snapshots_asin_created on public.notification_snapshots(asin, created_at desc);
create index if not exists idx_notification_snapshots_drivers_gin on public.notification_snapshots using gin(drivers);
create index if not exists idx_notification_snapshots_reco_gin on public.notification_snapshots using gin(recommendations);

create unique index if not exists uq_notification_daily_rollup_user_asin_date
  on public.notification_daily_rollup(user_id, asin, date);
create index if not exists idx_notification_daily_rollup_user on public.notification_daily_rollup(user_id);

create index if not exists idx_notification_feedback_user on public.notification_feedback(user_id);
create index if not exists idx_notification_feedback_asin on public.notification_feedback(asin);

-- Enable RLS
alter table public.notification_snapshots enable row level security;
alter table public.notification_daily_rollup enable row level security;
alter table public.notification_feedback enable row level security;

-- Policies: owner-only by user_id
-- Use DO blocks to avoid duplicate policy errors

-- notification_snapshots policies
DO $$ BEGIN
  create policy "snapshots_select_owner" on public.notification_snapshots
    for select using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "snapshots_insert_owner" on public.notification_snapshots
    for insert with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "snapshots_update_owner" on public.notification_snapshots
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "snapshots_delete_owner" on public.notification_snapshots
    for delete using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- notification_daily_rollup policies
DO $$ BEGIN
  create policy "rollup_select_owner" on public.notification_daily_rollup
    for select using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "rollup_insert_owner" on public.notification_daily_rollup
    for insert with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "rollup_update_owner" on public.notification_daily_rollup
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "rollup_delete_owner" on public.notification_daily_rollup
    for delete using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- notification_feedback policies
DO $$ BEGIN
  create policy "feedback_select_owner" on public.notification_feedback
    for select using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "feedback_insert_owner" on public.notification_feedback
    for insert with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "feedback_update_owner" on public.notification_feedback
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create policy "feedback_delete_owner" on public.notification_feedback
    for delete using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
