# Admin / RBAC — Tramo C (API)

**Estado:** hecho. API desplegada `49cf9a6`. Rollback: [`ROLLBACK-api-admin-tramo-c.md`](../ROLLBACK-api-admin-tramo-c.md).

## Alcance

Rutas `/api/v1/admin`, helpers, middleware admin, servicios tenant/RBAC/delegación/modulos-custom/audit/users y controladores asociados → `apps/api/src/modulos/admin/` con `index.js` + `fachada-node.js` y shims en paths legacy.

## Fuera de alcance

- Auth login / sesión / PWA (módulo 14)
- `packages/shared/src/auth/*`
- Renombrar paths o mensajes 401/403
- `workspace-service`, `roles-service`, `support-service` (siguen en `services/`; consumen shims/fachada)

## Verificación

- Caracterización: `admin-api.caracterizacion.test.mjs`
- `npm run test:security -w @salesapp/api`
- Humo de lectura `/api/v1/admin/me` sin sesión → 401/503
