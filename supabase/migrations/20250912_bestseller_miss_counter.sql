-- Track consecutive non-top1 parses to support conservative demotion
alter table if exists public.asin_data
  add column if not exists is_bestseller_miss_count integer default 0;

create index if not exists asin_data_bestseller_miss_idx on public.asin_data (is_bestseller_miss_count);
