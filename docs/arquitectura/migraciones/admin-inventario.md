# Admin / RBAC — inventario

**Estado inventario.** Sin moves. Paths HTTP de `/api/v1/admin/*` y permisos RPC no se renombran.

## Qué entra

API: `routes/admin.js`, controladores y servicios de tenant/RBAC (`tenant-rbac-service`, `tenant-admin-service`, `delegacion`, `modulos-custom` ligados a admin).

Web: páginas `pages/admin/*`, componentes de admin en `components/layout/admin-*` y matrices de permisos.

## Qué no entra

| Pieza | Por qué |
|-------|---------|
| Auth login / sesión / OneSignal / PWA | Módulo 14 |
| `packages/shared/src/auth/permissions.js` | Catálogo compartido; no se mueve en el primer tramo |
| Cambiar códigos 401/403 de admin | Contrato HTTP intacto |

## Verificación

Caracterizar rutas admin y códigos de denegación antes de mover. Humo de lectura sin escribir filas de producción.
