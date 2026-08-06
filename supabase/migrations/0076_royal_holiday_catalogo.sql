-- ============================================================
-- 0076 — Catálogo versionado Worksheet Royal Holiday (patrón reutilizable)
-- Tablas estructuradas por empresa + comisiones operativas + Extra DP/CC
-- ============================================================

-- Permitir punto de extensión para variantes de Worksheet
alter table public.flags drop constraint if exists flags_punto_extension_check;
alter table public.flags add constraint flags_punto_extension_check
  check (
    punto_extension is null
    or punto_extension in (
      'expediente.tab',
      'dashboard.sala.bloque',
      'clientes.columna',
      'worksheet.variante'
    )
  );

create table if not exists public.catalogo_configuracion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  version integer not null,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  creado_por uuid references public.profiles(id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  unique (empresa_id, version)
);

create unique index if not exists catalogo_configuracion_una_vigente_uidx
  on public.catalogo_configuracion (empresa_id)
  where vigente_hasta is null;

create table if not exists public.rh_bottom_line (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade,
  programa text not null,
  holiday_credits numeric not null,
  precio_minimo_sin_iva numeric not null default 0,
  precio_minimo_con_iva numeric not null default 0,
  cuota_anual_mfee numeric not null default 0
);

create index if not exists rh_bottom_line_catalogo_hc_idx
  on public.rh_bottom_line (catalogo_configuracion_id, holiday_credits);

create table if not exists public.rh_financiamiento (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade,
  enganche_pct numeric not null,
  plazo_meses integer not null,
  nacionalidad text not null check (nacionalidad in ('mexicano', 'argentino', 'resto')),
  tasa_interes numeric not null default 0,
  factor_mensual numeric not null,
  unique (catalogo_configuracion_id, enganche_pct, plazo_meses, nacionalidad)
);

create table if not exists public.rh_comisiones (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade,
  down_payment_pct numeric not null,
  hc_rango_min numeric not null,
  hc_rango_max numeric not null,
  posicion text not null,
  porcentaje_comision numeric not null,
  unique (catalogo_configuracion_id, down_payment_pct, hc_rango_min, hc_rango_max, posicion)
);

create table if not exists public.rh_regalos (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade,
  nombre text not null,
  costo numeric,
  cargas_permitidas text[] not null default '{}',
  restricciones jsonb not null default '{}'::jsonb,
  vigente_desde date,
  vigente_hasta date,
  notas text
);

create table if not exists public.rh_costo_administrativo (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade,
  enganche_pct_min numeric not null,
  monto_usd numeric not null,
  unique (catalogo_configuracion_id, enganche_pct_min)
);

create table if not exists public.rh_parametros_generales (
  id uuid primary key default gen_random_uuid(),
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id) on delete cascade unique,
  max_extra_dp integer not null default 6,
  max_extra_cc integer not null default 6,
  tarjetas_internas text[] not null default array['Invex','RCI'],
  moneda text not null default 'USD',
  impuestos jsonb not null default '{}'::jsonb,
  notas_pendientes text
);

-- Operación: ventas Worksheet RH + extras + comisiones
create table if not exists public.rh_ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  tool_calculation_id uuid,
  catalogo_configuracion_id uuid not null references public.catalogo_configuracion(id),
  holiday_credits numeric not null,
  monto_venta numeric not null,
  enganche_pct numeric not null,
  enganche_acumulado_pct numeric not null,
  nacionalidad text not null check (nacionalidad in ('mexicano', 'argentino', 'resto')),
  posicion text not null,
  costo_administrativo_usd numeric not null default 0,
  plazo_meses integer,
  factor_mensual numeric,
  mensualidad numeric,
  board_online numeric,
  regalos jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  membresia_activada_at timestamptz,
  membresia_firme_at timestamptz,
  comision_firme boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rh_ventas_empresa_idx on public.rh_ventas (empresa_id);
create index if not exists rh_ventas_workspace_idx on public.rh_ventas (workspace_id);

create table if not exists public.rh_extra_pagos (
  id uuid primary key default gen_random_uuid(),
  rh_venta_id uuid not null references public.rh_ventas(id) on delete cascade,
  tipo text not null check (tipo in ('extra_dp', 'extra_cc')),
  porcentaje numeric not null,
  fecha_programada date not null,
  cumplido boolean not null default false,
  cumplido_at timestamptz,
  metodo_pago text,
  calendar_entry_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists rh_extra_pagos_pendientes_idx
  on public.rh_extra_pagos (fecha_programada)
  where cumplido = false;

create table if not exists public.rh_comision_movimientos (
  id uuid primary key default gen_random_uuid(),
  rh_venta_id uuid not null references public.rh_ventas(id) on delete cascade,
  tipo text not null check (tipo in ('inicial', 'diferencia_extra_dp', 'descuento_cancelacion')),
  porcentaje numeric not null,
  monto_base numeric not null,
  monto_comision numeric not null,
  fecha_evento date not null,
  fecha_pago date not null,
  extra_dp_id uuid references public.rh_extra_pagos(id) on delete set null,
  estado text not null default 'programada'
    check (estado in ('programada', 'pagada', 'descontada', 'firme', 'anulada')),
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS helpers reuse
create or replace function public.rh_can_access_empresa(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = p_empresa_id and em.usuario_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = p_empresa_id and wm.usuario_id = auth.uid()
    );
$$;

alter table public.catalogo_configuracion enable row level security;
alter table public.rh_bottom_line enable row level security;
alter table public.rh_financiamiento enable row level security;
alter table public.rh_comisiones enable row level security;
alter table public.rh_regalos enable row level security;
alter table public.rh_costo_administrativo enable row level security;
alter table public.rh_parametros_generales enable row level security;
alter table public.rh_ventas enable row level security;
alter table public.rh_extra_pagos enable row level security;
alter table public.rh_comision_movimientos enable row level security;

create policy catalogo_config_select on public.catalogo_configuracion
  for select using (public.rh_can_access_empresa(empresa_id));
create policy catalogo_config_write on public.catalogo_configuracion
  for all using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

create policy rh_bl_select on public.rh_bottom_line for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_bl_write on public.rh_bottom_line for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_fin_select on public.rh_financiamiento for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_fin_write on public.rh_financiamiento for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_com_select on public.rh_comisiones for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_com_write on public.rh_comisiones for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_reg_select on public.rh_regalos for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_reg_write on public.rh_regalos for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_ca_select on public.rh_costo_administrativo for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_ca_write on public.rh_costo_administrativo for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_pg_select on public.rh_parametros_generales for select using (
  exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);
create policy rh_pg_write on public.rh_parametros_generales for all using (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
) with check (
  public.is_super_admin()
  or exists (select 1 from public.catalogo_configuracion c where c.id = catalogo_configuracion_id and public.rh_can_access_empresa(c.empresa_id))
);

create policy rh_ventas_select on public.rh_ventas for select using (
  public.is_super_admin() or usuario_id = auth.uid() or public.rh_can_access_empresa(empresa_id)
);
create policy rh_ventas_write on public.rh_ventas for all using (
  public.is_super_admin() or usuario_id = auth.uid() or public.rh_can_access_empresa(empresa_id)
) with check (
  public.is_super_admin() or usuario_id = auth.uid() or public.rh_can_access_empresa(empresa_id)
);

create policy rh_extra_select on public.rh_extra_pagos for select using (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
);
create policy rh_extra_write on public.rh_extra_pagos for all using (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
) with check (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
);

create policy rh_mov_select on public.rh_comision_movimientos for select using (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
);
create policy rh_mov_write on public.rh_comision_movimientos for all using (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
) with check (
  exists (select 1 from public.rh_ventas v where v.id = rh_venta_id and (public.is_super_admin() or v.usuario_id = auth.uid() or public.rh_can_access_empresa(v.empresa_id)))
);

grant select, insert, update, delete on public.catalogo_configuracion to authenticated, service_role;
grant select, insert, update, delete on public.rh_bottom_line to authenticated, service_role;
grant select, insert, update, delete on public.rh_financiamiento to authenticated, service_role;
grant select, insert, update, delete on public.rh_comisiones to authenticated, service_role;
grant select, insert, update, delete on public.rh_regalos to authenticated, service_role;
grant select, insert, update, delete on public.rh_costo_administrativo to authenticated, service_role;
grant select, insert, update, delete on public.rh_parametros_generales to authenticated, service_role;
grant select, insert, update, delete on public.rh_ventas to authenticated, service_role;
grant select, insert, update, delete on public.rh_extra_pagos to authenticated, service_role;
grant select, insert, update, delete on public.rh_comision_movimientos to authenticated, service_role;

comment on table public.catalogo_configuracion is
  'Versiones de catálogo Worksheet custom por empresa. vigente_hasta null = versión actual.';
