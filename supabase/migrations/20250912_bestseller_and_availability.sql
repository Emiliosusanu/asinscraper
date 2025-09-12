-- Ensure bestseller and availability columns exist on asin_data
alter table if exists public.asin_data
  add column if not exists is_bestseller boolean,
  add column if not exists stock_status text,
  add column if not exists availability_code text;

-- Constrain availability_code to known values (nullable allowed)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asin_availability_code_chk'
  ) then
    alter table public.asin_data
      add constraint asin_availability_code_chk
      check (
        availability_code in ('IN_STOCK','AVAILABLE_SOON','OUT_OF_STOCK','UNAVAILABLE')
        or availability_code is null
      );
  end if;
end $$;

-- Helpful indexes
create index if not exists asin_data_bestseller_idx on public.asin_data (is_bestseller);
create index if not exists asin_data_availability_idx on public.asin_data (availability_code);
