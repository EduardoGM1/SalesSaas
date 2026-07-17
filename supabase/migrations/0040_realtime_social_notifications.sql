-- Publicar tablas sociales para toasts in-app en desktop (sin depender de Web Push).
-- RLS de cada tabla sigue filtrando qué filas recibe cada cliente.

do $$
declare
  t text;
begin
  foreach t in array array['direct_messages', 'user_connections', 'prospect_shares']
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
