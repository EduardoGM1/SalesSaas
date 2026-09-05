-- 0091 — Registrar pareja OPC: persistir rate/total/calif/regalo/prospect_id en el INSERT
-- (esos campos son comerciales y el PATCH posterior los bloquea si origen=opc).

drop function if exists public.rh_premanifiesto_registrar_pareja(
  uuid, uuid, date, uuid, text, text, uuid, text, text, text, date, date, text, text, integer, text, text
);

create or replace function public.rh_premanifiesto_registrar_pareja(
  p_empresa_id uuid,
  p_workspace_id uuid,
  p_fecha date,
  p_ola_config_id uuid,
  p_origen text,
  p_prospect_nombre text,
  p_user_id uuid default auth.uid(),
  p_estado_procedencia text default null,
  p_agencia text default null,
  p_contrato text default null,
  p_check_in date default null,
  p_check_out date default null,
  p_room_type text default null,
  p_room_number text default null,
  p_nights integer default null,
  p_notas_csi text default null,
  p_notes text default null,
  p_rate numeric default null,
  p_total numeric default null,
  p_calif text default null,
  p_regalo_nombre text default null,
  p_prospect_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ola public.rh_premanifiesto_ola_config%rowtype;
  v_ocupado integer;
  v_row public.rh_premanifiesto%rowtype;
  v_lock_key bigint;
begin
  if p_user_id is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if p_origen not in ('marketing', 'opc') then
    raise exception 'origen inválido.' using errcode = '22023';
  end if;

  if coalesce(trim(p_prospect_nombre), '') = '' then
    raise exception 'prospect_nombre requerido.' using errcode = '22023';
  end if;

  if public.rh_can_access_empresa(p_empresa_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if p_origen = 'marketing' and public.rh_pm_can_write_marketing(p_user_id, p_workspace_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if p_origen = 'opc' and public.rh_pm_can_register_opc(p_user_id, p_workspace_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_ola
  from public.rh_premanifiesto_ola_config c
  where c.id = p_ola_config_id
    and c.empresa_id = p_empresa_id
    and c.activo is true;

  if not found then
    raise exception 'Ola no encontrada.' using errcode = '22023';
  end if;

  v_lock_key := hashtextextended(
    p_workspace_id::text || '|' || p_fecha::text || '|' || p_ola_config_id::text,
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*)::integer into v_ocupado
  from public.rh_premanifiesto p
  where p.workspace_id = p_workspace_id
    and p.fecha = p_fecha
    and p.ola_config_id = p_ola_config_id
    and p.status <> 'cancelado';

  if v_ocupado >= v_ola.cupo_max then
    raise exception 'PM_CUPO_LLENO' using errcode = 'P0001';
  end if;

  insert into public.rh_premanifiesto (
    empresa_id, workspace_id, fecha, ola_config_id, origen,
    prospect_nombre, prospect_id,
    show_time, notes, notas_csi, status,
    estado_procedencia, agencia, contrato,
    check_in, check_out, room_type, room_number, nights,
    rate, total, calif, regalo_nombre,
    comercial_bloqueado, created_by, updated_by
  ) values (
    p_empresa_id, p_workspace_id, p_fecha, p_ola_config_id, p_origen,
    trim(p_prospect_nombre), p_prospect_id,
    v_ola.hora, p_notes, p_notas_csi, 'pendiente',
    p_estado_procedencia, p_agencia, p_contrato,
    p_check_in, p_check_out, p_room_type, p_room_number, p_nights,
    p_rate, p_total, p_calif, p_regalo_nombre,
    (p_origen = 'opc'), p_user_id, p_user_id
  )
  returning * into v_row;

  return public.rh_premanifiesto_row_json(v_row, p_user_id);
end;
$$;

grant execute on function public.rh_premanifiesto_registrar_pareja(
  uuid, uuid, date, uuid, text, text, uuid, text, text, text, date, date, text, text, integer, text, text,
  numeric, numeric, text, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
