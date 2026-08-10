-- Royal Holiday: plazo Extra DP (forfeit) + fecha_venta de referencia

alter table public.rh_ventas
  add column if not exists fecha_venta date;

update public.rh_ventas
set fecha_venta = (created_at at time zone 'utc')::date
where fecha_venta is null;

alter table public.rh_extra_pagos
  add column if not exists forfeit boolean not null default false,
  add column if not exists forfeit_at timestamptz;

drop index if exists public.rh_extra_pagos_pendientes_idx;

create index if not exists rh_extra_pagos_pendientes_idx
  on public.rh_extra_pagos (fecha_programada)
  where cumplido = false and forfeit = false and tipo = 'extra_dp';

-- Regalos: alinear restricciones con Excel (catálogos vigentes Royal Holiday)
update public.rh_regalos r
set restricciones = coalesce(r.restricciones, '{}'::jsonb)
  || case
    when lower(trim(r.nombre)) like '%all inclusive%' then
      '{"venta_min_usd": 500, "venta_max_usd": 1000}'::jsonb
    when lower(trim(r.nombre)) like '%certificado de vuelo%' then
      '{"venta_min_usd": 500, "venta_max_usd": 1000}'::jsonb
    when lower(trim(r.nombre)) like '%move in%' then
      '{"moneda_costo": "MXN"}'::jsonb
    when lower(trim(r.nombre)) like '%bono de creditos%' then
      '{"vigencia_meses": 18, "hc_tiers": [10000, 15000, 30000]}'::jsonb
    else '{}'::jsonb
  end,
  costo = case
    when lower(trim(r.nombre)) like '%all inclusive%' then null
    when lower(trim(r.nombre)) like '%certificado de vuelo%' then null
    else r.costo
  end
where exists (
  select 1 from public.catalogo_configuracion c
  join public.empresas e on e.id = c.empresa_id
  where c.id = r.catalogo_configuracion_id
    and e.nombre = 'Royal Holiday'
    and c.vigente_hasta is null
);

update public.rh_parametros_generales pg
set notas_pendientes = 'Corte costo admin: 15%→750 USD, 27.5%→950 USD (confirmado). Posiciones OPC/X sin comisiones hasta definir en Excel.'
where exists (
  select 1 from public.catalogo_configuracion c
  join public.empresas e on e.id = c.empresa_id
  where c.id = pg.catalogo_configuracion_id
    and e.nombre = 'Royal Holiday'
    and c.vigente_hasta is null
);
