# Auth / sesión / PWA — Tramo C (API)

**Estado:** hecho en código (rama `arquitectura/auth-tramo-c`).

## Alcance

`/auth` y `/api/v1/auth/*` (session/workspace/realtime) + controladores + `session-service` → `apps/api/src/modulos/auth/`.

## Fuera

- `middleware/auth.js` y `supabase-server.js` (shims futuros si se mueven)
- OneSignal web
- Renombrar cookies o paths
