-- FORCE RLS en tablas public que ya tienen RLS habilitado.
-- El dueño de tabla deja de bypassear políticas; superuser/bypassrls (service_role) sigue pudiendo.

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = true
  loop
    execute format('alter table %I.%I force row level security', r.schemaname, r.tablename);
  end loop;
end
$$;
