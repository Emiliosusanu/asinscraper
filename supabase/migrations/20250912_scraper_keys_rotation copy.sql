-- Add rotation metadata for smart key scheduling and cooldowns
alter table if exists public.scraper_api_keys
  add column if not exists success_count integer default 0,
  add column if not exists failure_count integer default 0,
  add column if not exists last_success_at timestamptz,
  add column if not exists cooldown_until timestamptz;

-- Helpful indexes for scheduling and lookups
create index if not exists scraper_keys_user_service_status_idx
  on public.scraper_api_keys (user_id, service_name, status);

create index if not exists scraper_keys_cooldown_idx
  on public.scraper_api_keys (cooldown_until);

create index if not exists scraper_keys_last_used_idx
  on public.scraper_api_keys (last_used_at);

create index if not exists scraper_keys_last_success_idx
  on public.scraper_api_keys (last_success_at);
