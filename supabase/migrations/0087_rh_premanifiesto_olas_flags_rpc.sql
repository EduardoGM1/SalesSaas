-- ============================================================
-- 0087 — Premanifiesto RH: olas, flags, RPCs, RLS, columnas
-- ============================================================

-- ---------- Configuración de olas por empresa ----------
create table if not exists public.rh_premanifiesto_ola_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  orden integer not null,
  etiqueta text not null,
  hora time not null,
  cupo_max integer not null check (cupo_max > 0),
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (empresa_id, orden)
);

create index if not exists rh_pm_ola_config_empresa_idx
  on public.rh_premanifiesto_ola_config (empresa_id, orden);

alter table public.rh_premanifiesto_ola_config enable row level security;

comment on table public.rh_premanifiesto_ola_config is 'Plantilla de olas Premanifiesto RH por empresa';

-- ---------- Ampliación rh_premanifiesto ----------
alter table public.rh_premanifiesto
  add column if not exists ola_config_id uuid references public.rh_premanifiesto_ola_config(id) on delete restrict,
  add column if not exists origen text check (origen is null or origen in ('marketing', 'opc')),
  add column if not exists rep_id uuid references public.profiles(id) on delete set null,
  add column if not exists agencia text,
  add column if not exists contrato text,
  add column if not exists estado_procedencia text,
  add column if not exists check_in date,
  add column if not exists check_out date,
  add column if not exists room_type text,
  add column if not exists room_number text,
  add column if not exists nights integer check (nights is null or nights >= 0),
  add column if not exists rate numeric,
  add column if not exists total numeric,
  add column if not exists regalo_id uuid references public.rh_regalos(id) on delete set null,
  add column if not exists regalo_nombre text,
  add column if not exists calif text,
  add column if not exists concierge_nombre text,
  add column if not exists notas_csi text,
  add column if not exists comercial_bloqueado boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.rh_premanifiesto drop constraint if exists rh_premanifiesto_status_check;
alter table public.rh_premanifiesto
  add constraint rh_premanifiesto_status_check
  check (status in ('pendiente', 'en_sala', 'completado', 'cancelado'));

create index if not exists rh_premanifiesto_ola_fecha_idx
  on public.rh_premanifiesto (workspace_id, fecha, ola_config_id)
  where status <> 'cancelado';

-- ---------- Semilla olas default (empresas con Worksheet RH) ----------
insert into public.rh_premanifiesto_ola_config (empresa_id, orden, etiqueta, hora, cupo_max)
select e.id, v.orden, v.etiqueta, v.hora::time, v.cupo_max
from public.empresas e
cross join (
  values
    (1, 'OLA 1', '09:00', 10),
    (2, 'OLA 2', '10:30', 5),
    (3, 'OLA 3', '12:30', 5)
) as v(orden, etiqueta, hora, cupo_max)
where exists (
  select 1 from public.flags f
  where f.empresa_id = e.id and f.clave = 'worksheet.royal_holiday' and f.tipo = 'custom'
)
on conflict (empresa_id, orden) do nothing;

-- ---------- Flags Premanifiesto (custom por empresa RH) ----------
insert into public.flags (clave, nombre_visible, flag_padre, default_global, tipo, empresa_id)
select
  'rh.tool.premanifiesto',
  'Premanifiesto RH',
  ops.id,
  false,
  'custom',
  ops.empresa_id
from public.flags ops
where ops.clave = 'rh.tool.ops' and ops.tipo = 'custom' and ops.empresa_id is not null
  and not exists (
    select 1 from public.flags f2
    where f2.clave = 'rh.tool.premanifiesto' and f2.empresa_id = ops.empresa_id
  );

insert into public.flags (clave, nombre_visible, flag_padre, default_global, tipo, empresa_id)
select v.clave, v.nombre, pm.id, false, 'custom', pm.empresa_id
from public.flags pm
cross join (
  values
    ('rh.tool.premanifiesto.marketing', 'Premanifiesto — Marketing'),
    ('rh.tool.premanifiesto.opc', 'Premanifiesto — OPC'),
    ('rh.tool.premanifiesto.rep', 'Premanifiesto — Rep'),
    ('rh.tool.premanifiesto.csi', 'Premanifiesto — CSI (delegación)')
) as v(clave, nombre)
where pm.clave = 'rh.tool.premanifiesto' and pm.tipo = 'custom'
  and not exists (
    select 1 from public.flags f2
    where f2.clave = v.clave and f2.empresa_id = pm.empresa_id
  );

-- Padre ops en paquetes base; módulo premanifiesto en operacion-base/cierre/liner (sin hijos)
insert into public.paquete_flags (paquete_id, flag_id, activo)
select p.id, pm.id, true
from public.paquetes_acceso p
join public.flags pm on pm.empresa_id = p.empresa_id and pm.clave = 'rh.tool.premanifiesto'
where p.slug in ('operacion-base', 'cierre', 'liner')
on conflict (paquete_id, flag_id) do update set activo = true;

-- ---------- Helpers permisos ----------
create or replace function public.rh_pm_is_gerente_ws(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_miembros wm
    join public.roles r on r.id = wm.role_id
    where wm.usuario_id = p_user_id
      and wm.workspace_id = p_workspace_id
      and r.slug = 'gerente'
  );
$$;

create or replace function public.rh_pm_can_read_module(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.resolver_workspace_flag('rh.tool.ops', p_user_id, p_workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto', p_user_id, p_workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto.marketing', p_user_id, p_workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto.opc', p_user_id, p_workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto.rep', p_user_id, p_workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto.csi', p_user_id, p_workspace_id);
$$;

create or replace function public.rh_pm_can_write_marketing(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.resolver_workspace_flag('rh.tool.premanifiesto.marketing', p_user_id, p_workspace_id);
$$;

create or replace function public.rh_pm_can_register_opc(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.resolver_workspace_flag('rh.tool.premanifiesto.opc', p_user_id, p_workspace_id);
$$;

create or replace function public.rh_pm_can_act_as_rep(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.resolver_workspace_flag('rh.tool.premanifiesto.rep', p_user_id, p_workspace_id);
$$;

create or replace function public.rh_premanifiesto_can_view_csi(
  p_row public.rh_premanifiesto,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.rh_pm_can_write_marketing(p_user_id, p_row.workspace_id)
    or public.rh_pm_is_gerente_ws(p_user_id, p_row.workspace_id)
    or public.resolver_workspace_flag('rh.tool.premanifiesto.csi', p_user_id, p_row.workspace_id)
    or (p_row.rep_id is not null and p_row.rep_id = p_user_id)
    or (
      p_row.origen = 'opc'
      and p_row.created_by = p_user_id
      and public.rh_pm_can_register_opc(p_user_id, p_row.workspace_id)
    );
$$;

-- Serializa fila sin CSI si el caller no autorizado
create or replace function public.rh_premanifiesto_row_json(
  p_row public.rh_premanifiesto,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j jsonb;
begin
  j := jsonb_build_object(
    'id', p_row.id,
    'empresa_id', p_row.empresa_id,
    'workspace_id', p_row.workspace_id,
    'fecha', p_row.fecha,
    'prospect_nombre', p_row.prospect_nombre,
    'prospect_id', p_row.prospect_id,
    'show_time', p_row.show_time,
    'notes', p_row.notes,
    'status', p_row.status,
    'ola_config_id', p_row.ola_config_id,
    'origen', p_row.origen,
    'rep_id', p_row.rep_id,
    'agencia', p_row.agencia,
    'contrato', p_row.contrato,
    'estado_procedencia', p_row.estado_procedencia,
    'check_in', p_row.check_in,
    'check_out', p_row.check_out,
    'room_type', p_row.room_type,
    'room_number', p_row.room_number,
    'nights', p_row.nights,
    'rate', p_row.rate,
    'total', p_row.total,
    'regalo_id', p_row.regalo_id,
    'regalo_nombre', p_row.regalo_nombre,
    'calif', p_row.calif,
    'concierge_nombre', p_row.concierge_nombre,
    'comercial_bloqueado', p_row.comercial_bloqueado,
    'created_by', p_row.created_by,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at,
    'updated_by', p_row.updated_by
  );
  if public.rh_premanifiesto_can_view_csi(p_row, p_user_id) then
    j := j || jsonb_build_object('notas_csi', p_row.notas_csi);
  end if;
  return j;
end;
$$;

-- ---------- RPC: listar día con olas y cupos ----------
create or replace function public.rh_premanifiesto_dia(
  p_empresa_id uuid,
  p_workspace_id uuid,
  p_fecha date,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_can boolean;
  v_olas jsonb := '[]'::jsonb;
  v_ola record;
  v_entradas jsonb;
  v_ocupado integer;
begin
  if p_user_id is null or p_empresa_id is null or p_workspace_id is null or p_fecha is null then
    raise exception 'Parámetros requeridos.' using errcode = '22023';
  end if;

  if public.rh_can_access_empresa(p_empresa_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_can := public.rh_pm_can_read_module(p_user_id, p_workspace_id);
  if v_can is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  for v_ola in
    select c.*
    from public.rh_premanifiesto_ola_config c
    where c.empresa_id = p_empresa_id and c.activo is true
    order by c.orden
  loop
    select count(*)::integer into v_ocupado
    from public.rh_premanifiesto p
    where p.workspace_id = p_workspace_id
      and p.fecha = p_fecha
      and p.ola_config_id = v_ola.id
      and p.status <> 'cancelado';

    select coalesce(jsonb_agg(public.rh_premanifiesto_row_json(p, p_user_id) order by p.created_at), '[]'::jsonb)
    into v_entradas
    from public.rh_premanifiesto p
    where p.workspace_id = p_workspace_id
      and p.fecha = p_fecha
      and p.ola_config_id = v_ola.id
      and p.status <> 'cancelado';

    v_olas := v_olas || jsonb_build_array(jsonb_build_object(
      'ola_config_id', v_ola.id,
      'orden', v_ola.orden,
      'etiqueta', v_ola.etiqueta,
      'hora', to_char(v_ola.hora, 'HH24:MI'),
      'cupo_max', v_ola.cupo_max,
      'ocupado', v_ocupado,
      'disponible', greatest(v_ola.cupo_max - v_ocupado, 0),
      'entradas', v_entradas
    ));
  end loop;

  return jsonb_build_object(
    'fecha', p_fecha,
    'empresa_id', p_empresa_id,
    'workspace_id', p_workspace_id,
    'olas', v_olas
  );
end;
$$;

-- ---------- RPC: registrar pareja (enforcement cupo) ----------
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
  p_notes text default null
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
    comercial_bloqueado, created_by, updated_by
  ) values (
    p_empresa_id, p_workspace_id, p_fecha, p_ola_config_id, p_origen,
    trim(p_prospect_nombre), null,
    v_ola.hora, p_notes, p_notas_csi, 'pendiente',
    p_estado_procedencia, p_agencia, p_contrato,
    p_check_in, p_check_out, p_room_type, p_room_number, p_nights,
    (p_origen = 'opc'), p_user_id, p_user_id
  )
  returning * into v_row;

  return public.rh_premanifiesto_row_json(v_row, p_user_id);
end;
$$;

-- ---------- RPC: Rep toma caso ----------
create or replace function public.rh_premanifiesto_tomar_caso(
  p_empresa_id uuid,
  p_row_id uuid,
  p_prospect_id uuid default null,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rh_premanifiesto%rowtype;
begin
  if p_user_id is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_row
  from public.rh_premanifiesto p
  where p.id = p_row_id and p.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Registro no encontrado.' using errcode = '22023';
  end if;

  if public.rh_can_access_empresa(p_empresa_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if public.rh_pm_can_act_as_rep(p_user_id, v_row.workspace_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_row.status = 'cancelado' then
    raise exception 'Registro cancelado.' using errcode = '22023';
  end if;

  if v_row.rep_id is not null and v_row.rep_id <> p_user_id then
    raise exception 'Caso ya asignado a otro rep.' using errcode = '22023';
  end if;

  update public.rh_premanifiesto
  set
    rep_id = p_user_id,
    prospect_id = coalesce(p_prospect_id, prospect_id),
    status = 'en_sala',
    comercial_bloqueado = false,
    updated_by = p_user_id,
    updated_at = now()
  where id = p_row_id
  returning * into v_row;

  if p_prospect_id is not null and v_row.calif is not null and trim(v_row.calif) <> '' then
    update public.prospects
    set tipo_tour = v_row.calif, updated_at = now()
    where id = p_prospect_id;
  end if;

  return public.rh_premanifiesto_row_json(v_row, p_user_id);
end;
$$;

-- ---------- RPC: actualizar fila (PATCH controlado) ----------
create or replace function public.rh_premanifiesto_actualizar(
  p_empresa_id uuid,
  p_row_id uuid,
  p_patch jsonb,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rh_premanifiesto%rowtype;
  v_marketing boolean;
  v_rep boolean;
  v_opc_own boolean;
  v_comercial_keys text[] := array['rate','total','regalo_id','regalo_nombre','calif','concierge_nombre'];
  k text;
begin
  if p_user_id is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_row
  from public.rh_premanifiesto p
  where p.id = p_row_id and p.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Registro no encontrado.' using errcode = '22023';
  end if;

  if public.rh_can_access_empresa(p_empresa_id) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_marketing := public.rh_pm_can_write_marketing(p_user_id, v_row.workspace_id);
  v_rep := (v_row.rep_id = p_user_id and public.rh_pm_can_act_as_rep(p_user_id, v_row.workspace_id));
  v_opc_own := (
    v_row.origen = 'opc'
    and v_row.created_by = p_user_id
    and v_row.status = 'pendiente'
    and v_row.rep_id is null
    and public.rh_pm_can_register_opc(p_user_id, v_row.workspace_id)
  );

  if v_marketing is not true and v_rep is not true and v_opc_own is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_row.comercial_bloqueado is true then
    foreach k in array v_comercial_keys loop
      if p_patch ? k then
        if v_marketing is not true then
          raise exception 'Campos comerciales bloqueados.' using errcode = '42501';
        end if;
      end if;
    end loop;
  elsif v_rep is not true and v_marketing is not true then
    foreach k in array v_comercial_keys loop
      if p_patch ? k then
        raise exception 'Campos comerciales solo rep asignado o marketing.' using errcode = '42501';
      end if;
    end loop;
  end if;

  if p_patch ? 'notas_csi' and public.rh_premanifiesto_can_view_csi(v_row, p_user_id) is not true then
    raise exception 'No autorizado para CSI.' using errcode = '42501';
  end if;

  if p_patch ? 'status' and (p_patch->>'status') = 'cancelado' and v_marketing is not true and v_rep is not true then
    raise exception 'No autorizado para cancelar.' using errcode = '42501';
  end if;

  update public.rh_premanifiesto
  set
    prospect_nombre = coalesce(p_patch->>'prospect_nombre', prospect_nombre),
    prospect_id = case when p_patch ? 'prospect_id' then (p_patch->>'prospect_id')::uuid else prospect_id end,
    notes = coalesce(p_patch->>'notes', notes),
    notas_csi = case when p_patch ? 'notas_csi' then p_patch->>'notas_csi' else notas_csi end,
    estado_procedencia = coalesce(p_patch->>'estado_procedencia', estado_procedencia),
    agencia = coalesce(p_patch->>'agencia', agencia),
    contrato = coalesce(p_patch->>'contrato', contrato),
    check_in = case when p_patch ? 'check_in' then (p_patch->>'check_in')::date else check_in end,
    check_out = case when p_patch ? 'check_out' then (p_patch->>'check_out')::date else check_out end,
    room_type = coalesce(p_patch->>'room_type', room_type),
    room_number = coalesce(p_patch->>'room_number', room_number),
    nights = case when p_patch ? 'nights' then (p_patch->>'nights')::integer else nights end,
    rate = case when p_patch ? 'rate' then (p_patch->>'rate')::numeric else rate end,
    total = case when p_patch ? 'total' then (p_patch->>'total')::numeric else total end,
    regalo_id = case when p_patch ? 'regalo_id' then (p_patch->>'regalo_id')::uuid else regalo_id end,
    regalo_nombre = coalesce(p_patch->>'regalo_nombre', regalo_nombre),
    calif = coalesce(p_patch->>'calif', calif),
    concierge_nombre = coalesce(p_patch->>'concierge_nombre', concierge_nombre),
    status = coalesce(p_patch->>'status', status),
    updated_by = p_user_id,
    updated_at = now()
  where id = p_row_id
  returning * into v_row;

  if v_row.prospect_id is not null and v_row.calif is not null and trim(v_row.calif) <> '' then
    update public.prospects
    set tipo_tour = v_row.calif, updated_at = now()
    where id = v_row.prospect_id;
  end if;

  return public.rh_premanifiesto_row_json(v_row, p_user_id);
end;
$$;

-- ---------- RLS ----------
drop policy if exists rh_pm_ola_config_select on public.rh_premanifiesto_ola_config;
drop policy if exists rh_pm_ola_config_write on public.rh_premanifiesto_ola_config;
create policy rh_pm_ola_config_select on public.rh_premanifiesto_ola_config
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_pm_ola_config_write on public.rh_premanifiesto_ola_config
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

drop policy if exists rh_premanifiesto_select on public.rh_premanifiesto;
drop policy if exists rh_premanifiesto_write on public.rh_premanifiesto;
create policy rh_premanifiesto_select on public.rh_premanifiesto
  for select to authenticated
  using (
    public.rh_can_access_empresa(empresa_id)
    and public.rh_pm_can_read_module(auth.uid(), workspace_id)
  );
create policy rh_premanifiesto_write on public.rh_premanifiesto
  for all to authenticated
  using (
    public.is_super_admin()
    or (
      public.rh_can_access_empresa(empresa_id)
      and (
        public.rh_pm_can_write_marketing(auth.uid(), workspace_id)
        or (rep_id = auth.uid() and public.rh_pm_can_act_as_rep(auth.uid(), workspace_id))
        or (
          origen = 'opc' and created_by = auth.uid() and status = 'pendiente' and rep_id is null
          and public.rh_pm_can_register_opc(auth.uid(), workspace_id)
        )
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.rh_can_access_empresa(empresa_id)
      and (
        public.rh_pm_can_write_marketing(auth.uid(), workspace_id)
        or (rep_id = auth.uid() and public.rh_pm_can_act_as_rep(auth.uid(), workspace_id))
        or (
          origen = 'opc' and created_by = auth.uid() and status = 'pendiente' and rep_id is null
          and public.rh_pm_can_register_opc(auth.uid(), workspace_id)
        )
      )
    )
  );

grant execute on function public.rh_pm_is_gerente_ws(uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_pm_can_read_module(uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_pm_can_write_marketing(uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_pm_can_register_opc(uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_pm_can_act_as_rep(uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_can_view_csi(public.rh_premanifiesto, uuid) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_row_json(public.rh_premanifiesto, uuid) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_dia(uuid, uuid, date, uuid) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_registrar_pareja(
  uuid, uuid, date, uuid, text, text, uuid, text, text, text, date, date, text, text, integer, text, text
) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_tomar_caso(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.rh_premanifiesto_actualizar(uuid, uuid, jsonb, uuid) to authenticated, service_role;

comment on function public.rh_premanifiesto_registrar_pareja is
  'Inserta pareja en ola con lock transaccional; PM_CUPO_LLENO si cupo agotado (cancelado no cuenta).';
