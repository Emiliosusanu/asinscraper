-- Add publication_date to asin_data for display in UI
alter table if exists public.asin_data
  add column if not exists publication_date date;

create index if not exists asin_data_publication_idx on public.asin_data (publication_date);
