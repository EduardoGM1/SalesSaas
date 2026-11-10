# Auth / sesión / PWA — Tramo A (web)

**Estado:** cerrado en web (núcleo + OneSignal/push + supabase browser). Rollback: [`ROLLBACK-web-auth-tramo-a.md`](../ROLLBACK-web-auth-tramo-a.md) (núcleo `f211cc5`); tipes posteriores OneSignal y supabase.

## Alcance cerrado

Páginas auth, `AuthLayout`, `session-api`, helpers de callback/intent/home/reset local, `ProtectedRoute`, PWA register/install, OneSignal (`servicios/onesignal.js`), `push-enable`, `OneSignalProvider`, y cliente supabase browser (`servicios/supabase/*`).

Shims legacy: `lib/onesignal.js`, `lib/push-enable.js`, `components/providers/onesignal-provider.jsx`, `lib/supabase/{client,config,realtime-auth,ensure-browser-session}`.
