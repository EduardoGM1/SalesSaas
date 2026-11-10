# Auth / sesión / PWA — inventario

**Estado inventario.** Sin moves. Paths `/auth/*`, `/api/v1/auth/*`, cookies SSR y clave `sts4_auth_sync` no se renombran.

## Qué entra

API: `routes/auth.js`, `routes/session.js`, controladores y `session-service`; guards de `middleware/auth.js` y rate limits con shim si se mueven.

Web: páginas de login/registro/recuperación/callback, `session-api`, supabase browser, `ProtectedRoute`, PWA (register/install) y el borde OneSignal/push que quedó fuera del módulo 7.

## Qué no entra

| Pieza | Por qué |
|-------|---------|
| Admin / RBAC | Módulo 13 (A+C) |
| Sync / outbox / `sts4_*` de datos | Módulo 12; solo se toca `sts4_auth_sync` en logout |
| `packages/shared/src/auth/*` | Catálogo compartido |
| Notificaciones in-app / digest | Módulo 7 |
| `db-store` | Offline-first compartido |

## Tramos

1. **B (ligero):** rate limits / intent / contratos estáticos.
2. **A (web):** UI auth, sesión cliente, PWA, OneSignal.
3. **C (API):** rutas `/auth` y `/api/v1/auth/*` sin cambiar paths ni códigos.

## Verificación

Caracterizar login→session, signout, 401 de sesión y paths PWA/SW antes de mover. Humo sin escribir filas de producción.
