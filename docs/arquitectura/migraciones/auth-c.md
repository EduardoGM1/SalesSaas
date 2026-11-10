# Auth / sesión / PWA — Tramo C (API)

**Estado:** hecho. API desplegada `92776e1`. Rollback: [`ROLLBACK-api-auth-tramo-c.md`](../ROLLBACK-api-auth-tramo-c.md).

## Alcance

`/auth` y `/api/v1/auth/*` (session/workspace/realtime) + controladores + `session-service` → `apps/api/src/modulos/auth/`.

## Fuera

- `middleware/auth.js` y `supabase-server.js` (shims futuros si se mueven)
- OneSignal web
- Renombrar cookies o paths
