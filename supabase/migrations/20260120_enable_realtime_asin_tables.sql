do $$
begin
  begin
    alter publication supabase_realtime add table public.asin_data;
  exception when duplicate_object or undefined_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.asin_history;
  exception when duplicate_object or undefined_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.asin_events;
  exception when duplicate_object or undefined_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.kdp_top_books_month;
  exception when duplicate_object or undefined_object then
    null;
  end;
end $$;

alter table if exists public.asin_data replica identity full;
alter table if exists public.kdp_top_books_month replica identity full;
