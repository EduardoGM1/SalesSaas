-- ============================================================
-- Sales Timeshare — GRANTs de roles (fix)
-- Otorga a los roles de Supabase los privilegios sobre el schema public.
-- La seguridad de filas sigue garantizada por RLS (anon/authenticated solo
-- ven sus propias filas; service_role omite RLS para tareas de servidor).
-- Idempotente: se puede ejecutar varias veces sin problema.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;

-- Privilegios por defecto para objetos futuros creados por el rol actual.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
