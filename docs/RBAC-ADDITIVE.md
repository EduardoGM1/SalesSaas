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

3. Resultado de la consulta de verificación (prod, 2026-08-02):

| Tabla | adds | denies | Fecha |
|-------|------|--------|-------|
| `usuario_permisos_override` | **0** | **1** (pre-0063) → **0** tras aplicar | 2026-08-02 |
| `workspace_usuario_permisos_override` | **0** | **0** | 2026-08-02 (post-0063) |

Migración `0063` aplicada vía `scripts/apply-migration-0063.mjs` el 2026-08-02. Post-apply: ambos tablas en 0/0.

**Interpretación:** un solo override restrictivo y ningún aditivo. Al aplicar `0063`, ese deny se borra; el usuario afectado recuperará lo que su **rol** ya otorga para esa clave. Si la restricción debe mantenerse, **antes** de 0063 cámbiale el rol (no reintroducir deny).

Consulta opcional para ver quién/qué es el deny:

```sql
SELECT o.usuario_id, p.email, p.full_name, perm.clave, o.otorgado
FROM public.usuario_permisos_override o
JOIN public.permisos perm ON perm.id = o.permiso_id
LEFT JOIN public.profiles p ON p.id = o.usuario_id
WHERE o.otorgado = false;
```

## API Gerente (sala activa)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/workspace/team/roles` | Roles `scope=workspace` de la empresa |
| PATCH | `/api/v1/workspace/team/members/:id/role` | Asignar rol existente (`role_id`) |
| GET | `/api/v1/workspace/team/members/:id/overrides` | Techo + overrides aditivos |
| PUT | `/api/v1/workspace/team/members/:id/overrides` | `{ clave, otorgado: true }` |
| DELETE | `/api/v1/workspace/team/members/:id/overrides/:clave` | Quitar override aditivo |

El backend rechaza `otorgado: false` y claves fuera del techo (unión de permisos de roles workspace de la empresa).
