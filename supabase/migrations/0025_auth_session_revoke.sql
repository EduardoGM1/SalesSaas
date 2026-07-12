-- Invalidación inmediata de sesión entre dispositivos (el JWT de acceso
-- de Supabase sigue válido hasta exp; auth_revoked_at corta el acceso ya).
alter table public.profiles
  add column if not exists auth_revoked_at timestamptz;

comment on column public.profiles.auth_revoked_at is
  'Marca de cierre de sesión global. Tokens con iat anterior se rechazan.';

-- Realtime para que la PWA abierta reciba el logout sin refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
