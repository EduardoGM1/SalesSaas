# RBAC aditivo (plataforma → empresa → individual)

## Modelo

```
efectivo = techo_plataforma ∩ techo_empresa ∩ (permisos(rol_sala) ∪ overrides_aditivos)
```

- Overrides **nunca restan**. `otorgado=false` está deprecado.
- Quitar acceso = cambiar el **rol** del miembro o **suspender** la cuenta.
- En sala, la sesión usa `workspace_miembros.role_id` + overrides de sala (misma fuente que RLS vía `effective_workspace_permissions`).
- Roles de plataforma (Superadmin / Soporte) siguen en `profiles.role_id` fuera del contexto de sala.

---

## Verificación pre / post migración `0063`

### Consulta (Paso 1)

```sql
SELECT count(*) FILTER (WHERE otorgado) AS adds,
       count(*) FILTER (WHERE NOT otorgado) AS denies
FROM public.usuario_permisos_override;
```

### Resultados documentados

| Momento | Fecha (UTC) | adds | denies | Notas |
|---------|-------------|------|--------|-------|
| Pre-migración (SQL Editor, usuario) | 2026-08-02 ~21:00 local | **0** | **1** | Verificado manualmente en Dashboard |
| Post-migración (aplicación remota) | 2026-08-02 | **0** | **0** | Tras aplicar migración `0063` |
| Re-verificación formal | **2026-08-03T06:05:53.532Z** | **0** | **0** | `scripts/verify-rbac-additive.mjs` |

Misma consulta sobre `workspace_usuario_permisos_override` (re-verificación):

| Tabla | adds | denies |
|-------|------|--------|
| `workspace_usuario_permisos_override` | **0** | **0** |

### Estado de funciones SQL (re-verificación)

- `resolve_user_permission_keys`: **sin** `EXCEPT` / sin rama `otorgado = false`
- `effective_workspace_permissions`: **sin** `EXCEPT` / sin rama `otorgado = false`

→ La migración **0063 ya está aplicada** en producción y el resolutor es aditivo.

---

## Paso 3 — Denies existentes

### Pre-migración

- `denies = 1` en `usuario_permisos_override`.
- `adds = 0` → era un caso aislado, no un patrón masivo.

### Detalle del deny

La consulta de detalle del prompt usa tablas `usuarios` / columnas que no existen en este schema. Equivalente real:

```sql
SELECT o.usuario_id, p.email, p.full_name, o.permiso_id, perm.clave AS permiso, o.otorgado
FROM public.usuario_permisos_override o
JOIN public.permisos perm ON perm.id = o.permiso_id
LEFT JOIN public.profiles p ON p.id = o.usuario_id
WHERE o.otorgado = false;
```

**Estado actual (post-0063):** esa consulta devuelve **0 filas** (el deny ya fue limpiado por la migración).

**Limitación documentada:** el detalle (usuario + clave del deny) **no se capturó** antes de aplicar `0063` el 2026-08-02. Tras la limpieza no hay forma de reconstruir esa fila desde `usuario_permisos_override`. No existe tabla `admin_logs` en este proyecto para rastrearlo.

### Decisión / impacto

| Caso | Decisión | Justificación |
|------|----------|---------------|
| Único deny pre-0063 (usuario/clave desconocidos a posteriori) | Sin cambio de rol previo; se dejó limpiar | Era 1 registro aislado; tras limpieza, acceso = solo lo que otorga su rol actual. Si en smoke aparece alguien con un permiso “de más”, ajustar **rol** (no reintroducir deny). |

### Prueba manual recomendada (smoke)

1. Iniciar sesión con un vendedor y un gerente en sala.
2. Confirmar que la UI/nav refleja el rol de la sala (no un deny fantasma).
3. Si algún usuario concreto “antes no podía X y ahora sí” y no es deseable: cambiarle el **rol** en Mi equipo / Admin.

---

## Migración 0063

Archivo: `supabase/migrations/0063_rbac_additive_overrides.sql`  
Script: `npm run db:migrate -- 0063` (o `node scripts/apply-migration.mjs 0063`)  
Verificación: `node scripts/verify-rbac-additive.mjs` (requiere `DATABASE_URL` en `.env.local`)

**Estado producción: APLICADA** (2026-08-02). Re-verificación 2026-08-03 confirma `denies = 0` y funciones sin semántica deny.

---

## API Gerente (sala activa)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/workspace/team/roles` | Roles `scope=workspace` de la empresa |
| PATCH | `/api/v1/workspace/team/members/:id/role` | Asignar rol existente (`role_id`) |
| GET | `/api/v1/workspace/team/members/:id/overrides` | Techo + overrides aditivos |
| PUT | `/api/v1/workspace/team/members/:id/overrides` | `{ clave, otorgado: true }` |
| DELETE | `/api/v1/workspace/team/members/:id/overrides/:clave` | Quitar override aditivo |

El backend rechaza `otorgado: false` y claves fuera del techo (unión de permisos de roles workspace de la empresa).
