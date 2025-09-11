-- Extend asin_data with richer product attributes for royalties and UI
alter table if exists public.asin_data
  add column if not exists page_count integer,
  add column if not exists dimensions_raw text,
  add column if not exists trim_size text,
  add column if not exists binding text, -- e.g. 'paperback' | 'hardcover'
  add column if not exists language text,
  add column if not exists series text,
  add column if not exists category text,
  add column if not exists interior_type text, -- 'bw' | 'color' | 'premium'
  add column if not exists interior_confidence real, -- 0..1
  add column if not exists interior_detected boolean; -- true if auto-detected by scraper

-- Lightweight constraint to keep interior_type consistent
alter table if exists public.asin_data
  add constraint if not exists asin_interior_type_chk
  check (interior_type in ('bw','color','premium') or interior_type is null);

-- Helpful index when filtering by attributes
create index if not exists asin_data_interior_idx on public.asin_data (interior_type);
create index if not exists asin_data_binding_idx on public.asin_data (binding);
