# Auth / sesión / PWA — Tramo A (web)

**Estado:** núcleo + OneSignal/push en `modulos/auth`. Rollback web: [`ROLLBACK-web-auth-tramo-a.md`](../ROLLBACK-web-auth-tramo-a.md) (núcleo `f211cc5`); OneSignal/push en tip posterior.

## Alcance cerrado

Páginas auth, `AuthLayout`, `session-api`, helpers de callback/intent/home/reset local, `ProtectedRoute`, PWA register/install, OneSignal (`servicios/onesignal.js`), `push-enable` y `OneSignalProvider`.

Shims legacy: `lib/onesignal.js`, `lib/push-enable.js`, `components/providers/onesignal-provider.jsx`.

## Aún pendiente en A

`supabase` browser (`lib/supabase/client`) — refinamiento menor; no bloquea el cierre del tramo.
