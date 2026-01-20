alter table if exists public.asin_data
  add column if not exists is_great_on_kindle boolean;

create index if not exists asin_data_great_on_kindle_idx on public.asin_data (is_great_on_kindle);

alter table if exists public.asin_data
  drop constraint if exists asin_availability_code_chk;

alter table if exists public.asin_data
  add constraint asin_availability_code_chk
  check (
    availability_code in (
      'IN_STOCK',
      'AVAILABLE_SOON',
      'OUT_OF_STOCK',
      'UNAVAILABLE',
      'SHIP_DELAY',
      'LOW_STOCK',
      'OOS',
      'PREORDER',
      'POD',
      'OTHER_SELLERS',
      'UNKNOWN'
    )
    or availability_code is null
  );
