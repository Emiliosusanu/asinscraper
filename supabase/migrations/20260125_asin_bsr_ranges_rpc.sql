create or replace function public.get_asin_bsr_ranges(asin_ids uuid[])
returns table (
  asin_data_id uuid,
  min_bsr integer,
  max_bsr integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.asin_data_id,
    min(h.bsr)::int as min_bsr,
    max(h.bsr)::int as max_bsr
  from public.asin_history h
  where h.user_id = auth.uid()
    and h.asin_data_id = any(asin_ids)
    and h.bsr is not null
    and h.bsr > 0
  group by h.asin_data_id;
$$;

revoke all on function public.get_asin_bsr_ranges(uuid[]) from public;
grant execute on function public.get_asin_bsr_ranges(uuid[]) to authenticated;
