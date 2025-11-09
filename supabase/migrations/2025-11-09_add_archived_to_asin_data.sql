-- Add archive support to asin_data
alter table if exists public.asin_data
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz null;

-- Optional: index to speed up filtering by user + archived
create index if not exists idx_asin_data_user_archived on public.asin_data (user_id, archived);
