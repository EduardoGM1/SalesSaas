-- Nivel B: overrides de título y opciones por usuario (sin tocar banco global)
alter table public.survey_preguntas_usuario
  add column if not exists texto_override text,
  add column if not exists opciones_override jsonb;

comment on column public.survey_preguntas_usuario.texto_override is
  'Título custom del vendedor; null = usar i18n/banco';
comment on column public.survey_preguntas_usuario.opciones_override is
  'Lista activa [{key, label?}]; null = opciones del banco. label null/ausente en key de banco = i18n';

-- Re-seed permiso por defecto (idempotente; cubre entornos donde 0043 no asignó el rol)
insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('herramientas:survey_configurar_preguntas', 'Configurar preguntas del Survey', 'herramientas', 'app')
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where p.clave = 'herramientas:survey_configurar_preguntas'
  and r.slug in ('vendedor', 'admin', 'superadmin')
on conflict do nothing;
