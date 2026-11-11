-- 0103: estrechar *:ver_equipo en puestos no-gerente (residual D2).
-- Visibilidad de expedientes NO usa estas claves (0101); solo limpia drift de rol_permisos.
-- Conserva: superadmin; gerente de empresa (scope=workspace, empresa_id NOT NULL).
-- No toca: overrides, permisos_delegados, predicado RLS, es_gerente_asistente_o_admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_rp_ver_equipo_0103 (
  rol_id uuid NOT NULL,
  permiso_id uuid NOT NULL,
  role_slug text,
  empresa_id uuid,
  role_scope text,
  es_sistema boolean,
  permiso_clave text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._backup_rp_ver_equipo_0103 (
  rol_id, permiso_id, role_slug, empresa_id, role_scope, es_sistema, permiso_clave
)
SELECT
  rp.rol_id,
  rp.permiso_id,
  r.slug,
  r.empresa_id,
  r.scope,
  r.es_sistema,
  p.clave
FROM public.rol_permisos rp
JOIN public.roles r ON r.id = rp.rol_id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE p.clave IN (
  'expedientes:ver_equipo',
  'ventas:ver_equipo',
  'dashboard:ver_equipo',
  'metas:ver_equipo'
)
AND NOT (
  r.slug = 'superadmin'
  OR (r.slug = 'gerente' AND r.scope = 'workspace' AND r.empresa_id IS NOT NULL)
)
AND NOT EXISTS (
  SELECT 1
  FROM public._backup_rp_ver_equipo_0103 b
  WHERE b.rol_id = rp.rol_id AND b.permiso_id = rp.permiso_id
);

DELETE FROM public.rol_permisos rp
USING public.roles r, public.permisos p
WHERE rp.rol_id = r.id
  AND rp.permiso_id = p.id
  AND p.clave IN (
    'expedientes:ver_equipo',
    'ventas:ver_equipo',
    'dashboard:ver_equipo',
    'metas:ver_equipo'
  )
  AND NOT (
    r.slug = 'superadmin'
    OR (r.slug = 'gerente' AND r.scope = 'workspace' AND r.empresa_id IS NOT NULL)
  );

COMMIT;

-- Rollback (manual):
-- INSERT INTO public.rol_permisos (rol_id, permiso_id)
-- SELECT rol_id, permiso_id FROM public._backup_rp_ver_equipo_0103
-- ON CONFLICT DO NOTHING;
