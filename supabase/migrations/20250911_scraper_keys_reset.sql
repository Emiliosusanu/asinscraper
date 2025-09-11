-- Ensure additional bookkeeping columns exist for scraper_api_keys
alter table if exists public.scraper_api_keys
  add column if not exists last_reset_at timestamptz null,
  add column if not exists last_used_at timestamptz null;

-- Initialize last_reset_at to created_at where missing
update public.scraper_api_keys
set last_reset_at = coalesce(last_reset_at, created_at)
where last_reset_at is null;

-- Helpful indexes (safe if already exist)
create index if not exists scraper_api_keys_user_status_idx on public.scraper_api_keys (user_id, status);
create index if not exists scraper_api_keys_last_reset_idx on public.scraper_api_keys (last_reset_at);
