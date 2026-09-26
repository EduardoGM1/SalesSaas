-- Marketing: padres de flag para que los hijos rh.tool.* resuelvan en on,
-- y la misma base de permisos que el Liner de la misma empresa (la que ya
-- comparten OPC y Liner en sala: 28 claves).
--
-- No se copian claves que solo tiene un puesto y no son esa base:
--   workflow:cerrar                  — solo Cerrador
--   workflow:revisar                 — solo Gerente
--   workflow:asignar_cerrador        — solo Gerente
--   ventas:ver_equipo                — solo Gerente
-- Survey, Vacaciones y Analysis no se agregan al paquete. Si el Liner de la
-- empresa ya trae esas claves de acción, se copian igual que en OPC: sin el
-- flag el módulo no se muestra. El override individual sigue siendo el que
-- enciende el módulo para una persona.

insert into public.paquete_flags (paquete_id, flag_id, activo)
select mkt.id, pf.flag_id, true
from public.paquetes_acceso mkt
join public.paquetes_acceso opc
  on opc.empresa_id = mkt.empresa_id
 and opc.slug = 'opc-lobby'
join public.paquete_flags pf on pf.paquete_id = opc.id and pf.activo = true
join public.flags f on f.id = pf.flag_id
where mkt.slug = 'marketing'
  and f.clave in ('worksheet', 'worksheet.royal_holiday')
on conflict (paquete_id, flag_id) do update set activo = true;

insert into public.rol_permisos (rol_id, permiso_id)
select mkt.id, rp.permiso_id
from public.roles mkt
join public.roles liner
  on liner.empresa_id = mkt.empresa_id
 and liner.slug = 'liner'
 and liner.scope = 'workspace'
join public.rol_permisos rp on rp.rol_id = liner.id
join public.permisos p on p.id = rp.permiso_id
where mkt.slug = 'marketing'
  and mkt.scope = 'workspace'
  and p.clave not in (
    'workflow:cerrar',
    'workflow:revisar',
    'workflow:asignar_cerrador',
    'ventas:ver_equipo'
  )
on conflict (rol_id, permiso_id) do nothing;
