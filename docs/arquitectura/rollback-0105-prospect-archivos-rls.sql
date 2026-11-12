-- ROLLBACK companion — 0105_prospect_archivos_rls_ucap_backup_hardening.sql
-- Restaura políticas 0058 en prospect_archivos y estado previo de tablas backup (inseguro).
-- Usar solo tras apply fallido o decisión explícita de revertir.

begin;

-- ---------- prospect_archivos → políticas prod pre-0105 (0058 + ver_equipo) ----------
drop policy if exists "prospect_archivos_select" on public.prospect_archivos;
create policy "prospect_archivos_select" on public.prospect_archivos
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      exists (
        select 1 from public.prospects p
        where p.id = prospect_archivos.prospect_id
          and (
            p.user_id = auth.uid()
            or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
            or exists (
              select 1 from public.prospect_workflows pw
              where pw.prospect_id = p.id and pw.cerrador_id = auth.uid()
            )
            or exists (
              select 1 from public.prospect_shares ps
              where ps.prospect_id = p.id and ps.shared_with_id = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists "prospect_archivos_insert" on public.prospect_archivos;
create policy "prospect_archivos_insert" on public.prospect_archivos
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and public.user_in_workspace(auth.uid(), workspace_id)
    and exists (
      select 1 from public.prospects p
      where p.id = prospect_archivos.prospect_id
        and p.workspace_id = prospect_archivos.workspace_id
        and (
          p.user_id = auth.uid()
          or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
          or exists (
            select 1 from public.prospect_workflows pw
            where pw.prospect_id = p.id and pw.cerrador_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "prospect_archivos_delete" on public.prospect_archivos;
create policy "prospect_archivos_delete" on public.prospect_archivos
  for delete to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      uploaded_by = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
    )
  );

-- ---------- Tablas backup: revierte endurecimiento (re-expone anon si RLS off) ----------
-- ADVERTENCIA: re-expone el hallazgo C-14/C-05. Preferir rollback-0105-archivos-only.sql
-- si solo hay que revertir políticas de adjuntos.
do $$
declare
  t text;
begin
  foreach t in array array[
    '_backup_rp_ver_equipo_0103',
    'migracion_commit_b_eje_puesto_backup',
    'migracion_db_cleanup_20261001'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I no force row level security', t);
    execute format('alter table public.%I disable row level security', t);
    execute format(
      'grant select, insert, update, delete, references, trigger, truncate '
      || 'on table public.%I to anon, authenticated', t
    );
  end loop;

  -- migracion_vendedor_liner_backup: 0083 dejó RLS ON + revoke; no deshabilitar RLS.
  -- Tras un rollback completo de grants, re-afirmar REVOKE (estado post-0083/0105).
  if to_regclass('public.migracion_vendedor_liner_backup') is not null then
    execute 'revoke all on table public.migracion_vendedor_liner_backup from anon, authenticated';
  end if;
end
$$;

commit;
