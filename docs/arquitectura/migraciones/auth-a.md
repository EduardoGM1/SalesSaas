# Auth / sesión / PWA — Tramo A (web, parcial)

**Estado:** web núcleo desplegado `f211cc5` (páginas, session-api, ProtectedRoute, PWA register/install). Rollback: [`ROLLBACK-web-auth-tramo-a.md`](../ROLLBACK-web-auth-tramo-a.md). Pendiente en A: OneSignal/push y supabase browser.

## Alcance de este corte

Páginas auth, `AuthLayout`, `session-api` y helpers de callback/intent/home/reset local → `modulos/auth` con `paginas.js` y shims.

## Aún pendiente en A

`ProtectedRoute`, supabase browser, PWA register/install, OneSignal/push.
