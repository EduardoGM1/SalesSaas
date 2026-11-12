-- 0105_prospect_archivos_rls_ucap_backup_hardening.sql
-- Alinea metadatos de adjuntos con user_can_access_prospect (0101) y cierra
-- tablas backup/migración sin RLS que aún otorgaban privilegios a anon.
-- Rollback completo: docs/arquitectura/rollback-0105-prospect-archivos-rls.sql
-- Rollback solo archivos (sin re-exponer backup): docs/arquitectura/rollback-0105-archivos-only.sql

begin;

-- =============================================================================
-- 1) prospect_archivos — predicado único 0101 (sustituye ver_equipo + cerrador-only)
-- =============================================================================

drop policy if exists "prospect_archivos_select" on public.prospect_archivos;
create policy "prospect_archivos_select" on public.prospect_archivos
  for select to authenticated
  using (
    public.user_can_access_prospect(auth.uid(), prospect_id)
  );

drop policy if exists "prospect_archivos_insert" on public.prospect_archivos;
create policy "prospect_archivos_insert" on public.prospect_archivos
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.user_can_access_prospect(auth.uid(), prospect_id)
    and exists (
      select 1 from public.prospects p
      where p.id = prospect_archivos.prospect_id
        and p.workspace_id = prospect_archivos.workspace_id
    )
  );

drop policy if exists "prospect_archivos_delete" on public.prospect_archivos;
create policy "prospect_archivos_delete" on public.prospect_archivos
  for delete to authenticated
  using (
    public.user_can_access_prospect(auth.uid(), prospect_id)
    and (
      uploaded_by = auth.uid()
      or public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
    )
  );

comment on policy "prospect_archivos_select" on public.prospect_archivos is
  'Lectura alineada a user_can_access_prospect (0101): dueño, workflow, excepción rol, share.';

comment on policy "prospect_archivos_insert" on public.prospect_archivos is
  'INSERT: uploaded_by + user_can_access_prospect (asignación workflow/share/excepción rol).';

comment on policy "prospect_archivos_delete" on public.prospect_archivos is
  'DELETE: propio archivo o gerente/asistente/admin (0101). Ya no usa expedientes:ver_equipo (0058).';

-- =============================================================================
-- 2) Tablas backup / migración sin RLS (hallazgo prod: anon SELECT sin políticas)
--    Patrón 0083 migracion_vendedor_liner_backup: RLS ON + sin policies + revoke roles API.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    '_backup_rp_ver_equipo_0103',
    'migracion_commit_b_eje_puesto_backup',
    'migracion_db_cleanup_20261001',
    'migracion_vendedor_liner_backup'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- =============================================================================
-- 3) REVOKE anon — alcance Fase A (solo tablas operativas sin uso en login público)
-- =============================================================================
-- NO se revoca en esta migración (documentación):
--   • GRANT USAGE ON SCHEMA public TO anon — PostgREST / cliente pre-login.
--   • EXECUTE ON FUNCTIONS is_super_admin(), is_admin(), has_admin_permission() TO anon
--     — flujos de registro y chequeos antes de sesión (0004–0007, 0047, 0071).
--   • Privilegios tabla-a-tabla del resto de public con RLS=ON — el riesgo efectivo
--     es el predicado RLS; endurecer GRANT global anon es Fase B (post-inventario RPC).
--   • prospects_deleted — ya sin grants anon (0096).

commit;
