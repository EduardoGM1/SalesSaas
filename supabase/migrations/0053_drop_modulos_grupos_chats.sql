-- =============================================================================
-- 0053 — Limpieza del modelo introducido por 0050–0052 (módulos / grupos / chats)
-- =============================================================================
-- Idempotente: seguro si las tablas/funciones ya no existen.
-- Restaura RPCs de permisos al comportamiento pre-0050 (compatible con 0041/0047).
-- NO toca: roles/permisos base (0041+), Survey, Money Box, notificaciones, etc.
-- =============================================================================

-- ---------- 1) Políticas RLS de “equipo gerente” ----------
drop policy if exists prospects_select_team on public.prospects;
drop policy if exists sales_select_team on public.sales;
drop policy if exists activities_select_team on public.activities;
drop policy if exists goals_select_team on public.goals;
drop policy if exists cal_select_team on public.calendar_entries;
drop policy if exists tool_calc_select_team on public.tool_calculations;

-- ---------- 2) Chat grupal (0052) — antes de grupos por FK ----------
drop policy if exists chat_msg_insert on public.chat_messages;
drop policy if exists chat_msg_select on public.chat_messages;
drop policy if exists chat_part_update_self on public.chat_participants;
drop policy if exists chat_part_all_super on public.chat_participants;
drop policy if exists chat_part_select on public.chat_participants;
drop policy if exists chat_conv_update on public.chat_conversations;
drop policy if exists chat_conv_insert on public.chat_conversations;
drop policy if exists chat_conv_select on public.chat_conversations;

drop table if exists public.chat_messages cascade;
drop table if exists public.chat_participants cascade;
drop table if exists public.chat_conversations cascade;

drop function if exists public.is_chat_participant(uuid, uuid);
drop function if exists public.sync_grupo_chat(uuid);

do $$
begin
  begin
    alter publication supabase_realtime drop table public.chat_messages;
  exception
    when undefined_object then null;
    when undefined_table then null;
    when others then null;
  end;
end $$;

-- ---------- 3) Módulos activables (0050/0051) ----------
drop policy if exists modulo_act_select_related on public.modulo_activacion;
drop policy if exists modulo_act_write_super on public.modulo_activacion;
drop policy if exists modulos_select_all on public.modulos;
drop policy if exists modulos_write_super on public.modulos;

drop table if exists public.modulo_activacion cascade;
drop table if exists public.modulos cascade;

drop function if exists public.admin_set_modulo_activacion(text, text, boolean, uuid, uuid, uuid);
drop function if exists public.resolve_user_modulos(uuid);
drop function if exists public.resolve_modulo_activo(uuid, text);

-- ---------- 4) Organizaciones / grupos (0050/0051) ----------
drop policy if exists grupo_miembros_select_related on public.grupo_miembros;
drop policy if exists grupo_miembros_write_super on public.grupo_miembros;
drop policy if exists grupos_select_related on public.grupos;
drop policy if exists grupos_write_super on public.grupos;
drop policy if exists org_select_member on public.organizaciones;
drop policy if exists org_write_super on public.organizaciones;

drop function if exists public.admin_upsert_grupo(uuid, text, uuid, uuid, uuid[]);
drop function if exists public.admin_delete_grupo(uuid);
drop function if exists public.is_gerente_of(uuid);
drop function if exists public.team_member_ids(uuid);
drop function if exists public.my_grupo_ids(uuid);
drop function if exists public.is_grupo_gerente(uuid, uuid);

-- Reasignar usuarios del rol Gerente → Vendedor (si el rol sistema existe)
do $$
declare
  v_gerente uuid := 'a0000000-0000-4000-8000-000000000005';
  v_vendedor uuid := 'a0000000-0000-4000-8000-000000000003';
begin
  if exists (select 1 from public.roles where id = v_gerente) then
    update public.profiles
    set role_id = v_vendedor,
        role = 'vendedor'::public.user_role
    where role_id = v_gerente;

    delete from public.rol_permisos where rol_id = v_gerente;
    delete from public.roles where id = v_gerente;
  end if;
end $$;

drop table if exists public.grupo_miembros cascade;
drop table if exists public.grupos cascade;

alter table public.profiles drop column if exists organizacion_id;

drop table if exists public.organizaciones cascade;

-- ---------- 5) Columna permite_override (Tema 3 en 0050) ----------
alter table public.permisos drop column if exists permite_override;

-- ---------- 6) Restaurar RPCs de overrides (0041, sin filtro permite_override) ----------
create or replace function public.admin_set_user_permission_overrides(
  p_target_id uuid,
  p_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_super boolean;
  rec jsonb;
  v_clave text;
  v_otorgado boolean;
  v_permiso_id uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select is_super_admin into v_target_super from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then raise exception 'No puedes modificar overrides del Superadmin'; end if;

  delete from public.usuario_permisos_override where usuario_id = p_target_id;

  for rec in select * from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    v_clave := rec->>'clave';
    v_otorgado := coalesce((rec->>'otorgado')::boolean, false);
    select id into v_permiso_id from public.permisos where clave = v_clave;
    if v_permiso_id is not null then
      insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
      values (p_target_id, v_permiso_id, v_otorgado)
      on conflict (usuario_id, permiso_id) do update
        set otorgado = excluded.otorgado, updated_at = now();
    end if;
  end loop;

  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_permission_overrides(uuid, jsonb) to authenticated;

-- Permisos admin delegados: claves consolidadas (0047) + aliases legacy
create or replace function public.admin_set_user_permissions(
  p_target_id uuid,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'ver_resumen', 'gestionar_usuarios', 'gestionar_metas', 'ver_metricas', 'gestionar_soporte',
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'goals:read', 'tools:analytics'
  ];
  v_clean text[];
  v_mapped text[];
  v_target_role public.user_role;
  v_target_super boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select role, is_super_admin into v_target_role, v_target_super
  from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then
    raise exception 'No puedes modificar permisos del administrador principal';
  end if;
  if v_target_role is distinct from 'admin'::public.user_role then
    raise exception 'Solo aplica a usuarios con rol admin';
  end if;

  select coalesce(array_agg(distinct p), '{}'::text[])
  into v_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as p
  where p = any(v_allowed);

  -- Normalizar a claves consolidadas
  select coalesce(array_agg(distinct x), '{}'::text[])
  into v_mapped
  from (
    select case
      when p in ('dashboard:read') then 'ver_resumen'
      when p in ('users:read','users:deactivate','users:activate','users:export','users:role','users:permissions') then 'gestionar_usuarios'
      when p in ('goals:read') then 'gestionar_metas'
      when p in ('tools:analytics','worksheets:read') then 'ver_metricas'
      else p
    end as x
    from unnest(coalesce(v_clean, '{}'::text[])) p
  ) s
  where x in ('ver_resumen','gestionar_usuarios','gestionar_metas','ver_metricas','gestionar_soporte');

  update public.profiles
  set admin_permissions = coalesce(v_mapped, '{}'::text[])
  where id = p_target_id;

  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;

-- Restaurar sync legacy (0047) sin rama slug gerente
create or replace function public.sync_profile_legacy_permissions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[];
  v_has_admin boolean;
  v_sales text[];
  v_admin text[];
begin
  v_keys := public.resolve_user_permission_keys(p_user_id);

  v_has_admin := exists (
    select 1 from unnest(v_keys) k
    where k in (
      'ver_resumen','gestionar_usuarios','ver_logs','gestionar_metas','ver_metricas',
      'gestionar_soporte','gestionar_roles_permisos','ver_metricas_financieras_usuarios',
      'dashboard:read','users:read','users:deactivate','users:activate','users:export',
      'users:role','users:permissions','goals:read','tools:analytics',
      'support:read','ver_tickets_soporte','responder_tickets_soporte',
      'ver_logs_administracion','admin:roles'
    )
  );

  select coalesce(array_agg(k), '{}') into v_sales
  from unnest(v_keys) k
  where k in ('sales:view_modal','sales:view_detail','sales:history');

  if cardinality(v_sales) = 3 then
    v_sales := '{}';
  end if;

  select coalesce(array_agg(k), '{}') into v_admin
  from unnest(v_keys) k
  where k in (
    'ver_resumen','gestionar_usuarios','gestionar_metas','ver_metricas','gestionar_soporte',
    'ver_logs','gestionar_roles_permisos'
  );

  update public.profiles
  set
    role = case
      when is_super_admin then 'admin'::public.user_role
      when v_has_admin then 'admin'::public.user_role
      else 'vendedor'::public.user_role
    end,
    user_permissions = v_sales,
    admin_permissions = case
      when is_super_admin then '{}'::text[]
      when v_has_admin then v_admin
      else '{}'::text[]
    end
  where id = p_user_id;
end;
$$;

grant execute on function public.sync_profile_legacy_permissions(uuid) to authenticated;

-- Re-sync perfiles con role_id
do $$
declare
  u record;
begin
  for u in select id from public.profiles where role_id is not null loop
    perform public.sync_profile_legacy_permissions(u.id);
  end loop;
end $$;

comment on schema public is 'Post-cleanup 0053: sin módulos/grupos/chats de 0050–0052.';
