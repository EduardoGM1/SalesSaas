# RBAC aditivo (plataforma → empresa → individual)

## Modelo

```
efectivo = techo_plataforma ∩ techo_empresa ∩ (permisos(rol_sala) ∪ overrides_aditivos)
```

- Overrides **nunca restan**. `otorgado=false` está deprecado.
- Quitar acceso = cambiar el **rol** del miembro o **suspender** la cuenta.
- En sala, la sesión usa `workspace_miembros.role_id` + overrides de sala (misma fuente que RLS vía `effective_workspace_permissions`).
- Roles de plataforma (Superadmin / Soporte) siguen en `profiles.role_id` fuera del contexto de sala.

## Migración 0063 (obligatoria en Supabase)

Archivo: `supabase/migrations/0063_rbac_additive_overrides.sql`

1. **Antes de aplicar**, documentar conteos:

```sql
SELECT count(*) FILTER (WHERE otorgado) AS adds,
       count(*) FILTER (WHERE NOT otorgado) AS denies
FROM public.usuario_permisos_override;

SELECT count(*) FILTER (WHERE otorgado) AS adds,
       count(*) FILTER (WHERE NOT otorgado) AS denies
FROM public.workspace_usuario_permisos_override;
```

2. Aplicar 0063 (borra denies y reescribe resolutores SQL sin `EXCEPT`).

3. Anotar aquí el resultado de la consulta de verificación:

| Tabla | adds | denies | Fecha |
|-------|------|--------|-------|
| `usuario_permisos_override` | _pendiente_ | _pendiente_ | |
| `workspace_usuario_permisos_override` | _pendiente_ | _pendiente_ | |

> Al eliminar denies, un usuario que dependía de una restricción vía override recuperará el permiso de su rol. Si eso no es deseable, **antes** del deploy cámbiale el rol a uno más restringido.

## API Gerente (sala activa)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/workspace/team/roles` | Roles `scope=workspace` de la empresa |
| PATCH | `/api/v1/workspace/team/members/:id/role` | Asignar rol existente (`role_id`) |
| GET | `/api/v1/workspace/team/members/:id/overrides` | Techo + overrides aditivos |
| PUT | `/api/v1/workspace/team/members/:id/overrides` | `{ clave, otorgado: true }` |
| DELETE | `/api/v1/workspace/team/members/:id/overrides/:clave` | Quitar override aditivo |

El backend rechaza `otorgado: false` y claves fuera del techo (unión de permisos de roles workspace de la empresa).
