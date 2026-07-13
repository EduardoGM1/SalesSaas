-- Publicar tablas del Dashboard en Realtime (Postgres Changes).
-- RLS de cada tabla sigue filtrando qué filas recibe cada cliente.

do $$
declare
  t text;
begin
  foreach t in array array['prospects', 'sales', 'goals', 'calendar_entries']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
