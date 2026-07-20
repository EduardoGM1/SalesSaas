-- Permiso sensible: métricas por usuario (expedientes/ventas/volumen) solo Superadmin por defecto.
-- No se asigna al rol Admin sistema.

insert into public.permisos (clave, nombre_visible, modulo, capa)
values (
  'ver_metricas_financieras_usuarios',
  'Admin: ver métricas financieras por usuario',
  'admin',
  'admin'
)
on conflict (clave) do update
set
  nombre_visible = excluded.nombre_visible,
  modulo = excluded.modulo,
  capa = excluded.capa;

-- Asegurar que el rol Admin NO lo tenga (idempotente).
delete from public.rol_permisos rp
using public.roles r, public.permisos p
where rp.rol_id = r.id
  and rp.permiso_id = p.id
  and r.slug = 'admin'
  and r.es_sistema = true
  and p.clave = 'ver_metricas_financieras_usuarios';
