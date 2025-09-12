-- Performance & Notifications v2 schema
-- Safe to run multiple times; uses IF NOT EXISTS and guards.

-- Enable necessary extensions
create extension if not exists pgcrypto;

-- 1) Daily rollups of ASIN metrics
create table if not exists public.asin_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asin_data_id uuid not null references public.asin_data(id) on delete cascade,
  asin text not null,
  country text not null,
  day date not null,
  bsr integer,
  price numeric(10,2),
  review_count integer,
  rating numeric(4,2),
  availability_code text,
  stock_status text,
  sales_est_low integer,
  sales_est_high integer,
  revenue_est_low numeric(12,2),
  revenue_est_high numeric(12,2),
  created_at timestamptz not null default now(),
  unique(asin_data_id, day)
);
create index if not exists idx_adm_user_day on public.asin_daily_metrics(user_id, day desc);
create index if not exists idx_adm_asin_day on public.asin_daily_metrics(asin_data_id, day desc);

-- 2) Category baselines (portfolio-level; can be migrated to global later)
create table if not exists public.category_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  country text not null,
  category text not null,
  day date not null,
  bsr_p20 integer,
  bsr_p50 integer,
  bsr_p80 integer,
  price_p50 numeric(10,2),
  volume_index numeric(8,4), -- seasonality factor, 1.0 = neutral
  created_at timestamptz not null default now(),
  unique(user_id, country, category, day)
);
create index if not exists idx_cb_user_day on public.category_baselines(user_id, day desc);

-- 3) Peer mapping (lightweight competitor graph)
create table if not exists public.asin_peers (
  user_id uuid not null,
  asin_data_id uuid not null references public.asin_data(id) on delete cascade,
  peer_asin_data_id uuid not null references public.asin_data(id) on delete cascade,
  score numeric(6,4) not null,
  created_at timestamptz not null default now(),
  primary key (asin_data_id, peer_asin_data_id)
);
create index if not exists idx_peers_user_asin on public.asin_peers(user_id, asin_data_id);

-- 4) Performance snapshots (computed KPIs)
create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asin_data_id uuid not null references public.asin_data(id) on delete cascade,
  asin text not null,
  country text not null,
  day date not null,
  qi_score smallint,                   -- 0..100
  baseline_percentile numeric(6,3),    -- 0..1
  volatility_30 numeric(10,4),         -- stddev of normalized BSR 30d
  momentum_7 numeric(10,4),            -- slope/dir over last 7d
  elasticity_est numeric(10,4),        -- dBSR/dPrice or similar
  notes text,
  created_at timestamptz not null default now(),
  unique(asin_data_id, day)
);
create index if not exists idx_ps_user_day on public.performance_snapshots(user_id, day desc);

-- 5) Tips library (curated playbooks)
create table if not exists public.tips_library (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  body_md text not null,
  metric_keys text[] default '{}',
  severity text default 'info', -- info|warning|critical
  created_at timestamptz not null default now()
);

-- 6) Notification rules (user-configurable)
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  rule_type text not null, -- e.g. 'threshold','anomaly','digest'
  condition jsonb not null, -- JSON expression for rule
  cooloff_seconds integer default 21600, -- 6h
  channels text[] not null default array['inapp','email']::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_nr_user on public.notification_rules(user_id);

-- 7) Notification events (emitted alerts/tips)
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asin_data_id uuid references public.asin_data(id) on delete set null,
  rule_id uuid references public.notification_rules(id) on delete set null,
  severity text not null default 'info',
  title text not null,
  body_md text not null,
  channel text not null default 'inapp',
  dedupe_key text,
  status text not null default 'queued', -- queued|sent|read
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_ne_user_created on public.notification_events(user_id, created_at desc);
create index if not exists idx_ne_dedupe on public.notification_events(user_id, dedupe_key);

-- 8) Basic RLS (mirror existing pattern: user_id = auth.uid())
alter table public.asin_daily_metrics enable row level security;
alter table public.category_baselines enable row level security;
alter table public.asin_peers enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.tips_library enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_events enable row level security;

-- SELECT policies
create policy if not exists "adm_select_own" on public.asin_daily_metrics for select using (user_id = auth.uid());
create policy if not exists "cb_select_own" on public.category_baselines for select using (user_id = auth.uid());
create policy if not exists "peers_select_own" on public.asin_peers for select using (user_id = auth.uid());
create policy if not exists "ps_select_own" on public.performance_snapshots for select using (user_id = auth.uid());
create policy if not exists "tips_select_all" on public.tips_library for select using (true);
create policy if not exists "nr_select_own" on public.notification_rules for select using (user_id = auth.uid());
create policy if not exists "ne_select_own" on public.notification_events for select using (user_id = auth.uid());

-- INSERT policies
create policy if not exists "adm_insert_own" on public.asin_daily_metrics for insert with check (user_id = auth.uid());
create policy if not exists "cb_insert_own" on public.category_baselines for insert with check (user_id = auth.uid());
create policy if not exists "peers_insert_own" on public.asin_peers for insert with check (user_id = auth.uid());
create policy if not exists "ps_insert_own" on public.performance_snapshots for insert with check (user_id = auth.uid());
create policy if not exists "tips_insert_admin" on public.tips_library for insert with check (true);
create policy if not exists "nr_insert_own" on public.notification_rules for insert with check (user_id = auth.uid());
create policy if not exists "ne_insert_own" on public.notification_events for insert with check (user_id = auth.uid());

-- UPDATE policies
create policy if not exists "adm_update_own" on public.asin_daily_metrics for update using (user_id = auth.uid());
create policy if not exists "cb_update_own" on public.category_baselines for update using (user_id = auth.uid());
create policy if not exists "peers_update_own" on public.asin_peers for update using (user_id = auth.uid());
create policy if not exists "ps_update_own" on public.performance_snapshots for update using (user_id = auth.uid());
create policy if not exists "tips_update_admin" on public.tips_library for update using (true);
create policy if not exists "nr_update_own" on public.notification_rules for update using (user_id = auth.uid());
create policy if not exists "ne_update_own" on public.notification_events for update using (user_id = auth.uid());

-- Optional: helpful view to emulate rotation ordering in SQL (for monitoring)
create or replace view public.view_usable_keys_ordered as
select id, user_id, service_name, status, credits, cost_per_call, last_success_at, last_used_at, failure_count, cooldown_until
from public.scraper_api_keys
where status = 'active'
  and credits >= greatest(1, cost_per_call)
  and (cooldown_until is null or cooldown_until <= now());
-- consumers should add: where user_id = '<uid>' and service_name = 'scraperapi'

