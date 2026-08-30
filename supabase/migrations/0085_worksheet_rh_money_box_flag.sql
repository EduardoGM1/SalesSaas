-- Pestaña Money Box en Worksheet Royal Holiday (custom por tenant RH).
-- Hijo de worksheet.royal_holiday; default_global true en paquetes operacion-base / cierre / liner.

alter table public.flags drop constraint if exists flags_punto_extension_check;
alter table public.flags add constraint flags_punto_extension_check
  check (
    punto_extension is null
    or punto_extension in (
      'expediente.tab',
      'dashboard.sala.bloque',
      'clientes.columna',
      'worksheet.variante',
      'worksheet.tab'
    )
  );

insert into public.flags (clave, nombre_visible, flag_padre, default_global, tipo, empresa_id, punto_extension)
select
  'worksheet.royal_holiday.money_box',
  'Money Box (Worksheet RH)',
  rh.id,
  true,
  'custom',
  rh.empresa_id,
  'worksheet.tab'
from public.flags rh
where rh.clave = 'worksheet.royal_holiday'
  and rh.tipo = 'custom'
  and rh.empresa_id is not null
  and not exists (
    select 1 from public.flags f2
    where f2.clave = 'worksheet.royal_holiday.money_box'
      and f2.empresa_id = rh.empresa_id
  );

insert into public.paquete_flags (paquete_id, flag_id, activo)
select p.id, mb.id, true
from public.flags mb
join public.paquetes_acceso p on p.empresa_id = mb.empresa_id
where mb.clave = 'worksheet.royal_holiday.money_box'
  and mb.tipo = 'custom'
  and p.slug in ('operacion-base', 'cierre', 'liner')
on conflict (paquete_id, flag_id) do update set activo = true;

-- Cadena padre: worksheet (estándar) requerido por resolver_workspace_flag → RH → money_box
insert into public.paquete_flags (paquete_id, flag_id, activo)
select p.id, w.id, true
from public.flags w
cross join public.paquetes_acceso p
where w.clave = 'worksheet'
  and w.tipo = 'estandar'
  and w.empresa_id is null
  and p.slug in ('operacion-base', 'cierre', 'liner')
  and p.empresa_id in (
    select rh.empresa_id from public.flags rh
    where rh.clave = 'worksheet.royal_holiday.money_box' and rh.tipo = 'custom'
  )
on conflict (paquete_id, flag_id) do update set activo = true;
