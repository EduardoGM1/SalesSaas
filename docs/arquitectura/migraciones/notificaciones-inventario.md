# Inventario — recordatorios / notificaciones (módulo 7)

**Alcance:** solo inventario. Sin rama de código, sin mover archivos, sin deploy, sin BD.  
**Fecha:** post money-box `a81578c`.

**Hallazgo clave:** no hay un “notification center” / inbox aparte. El canal in-app es **Toaster + Realtime**; el push es **OneSignal** con SW en `/onesignal/`; los recordatorios operativos salen de **agenda (`cal`) + `processDate`** vía digest/cola `scheduled_push_jobs`.

---

## 0. Estado real antes del Tramo A (`main` = `5ed6c09`)

Tramo B en `main` (`503928f`): dominio puro web (`armar-notificacion`, `cooldown-digest`, `fecha-recordatorio-local`, `mapeo-pushtype`, `preferencias-notificacion`) con fachada `index.js`; `notificacion-payload.ts` ya solo tenía tipos y reexportaba el armado. Las rutas de las secciones 1–5 son las previas al Tramo A; dónde quedó cada archivo está en [`notificaciones.md`](./notificaciones.md) §2.

| Grupo | Archivo (`apps/web/src/`) | Líneas | Importado por |
|-------|---------------------------|-------:|---------------|
| Toaster / toasts | `components/ui/toaster.jsx` | 190 | `sync-provider.jsx` |
| | `lib/toast.ts` | 65 | 45 archivos (incluye `push-enable.js` y la UI de money-box) |
| In-app | `lib/in-app-notifications.js` | 363 | `in-app-notifications-realtime.js` |
| | `lib/in-app-notifications-realtime.js` | 287 | coordinador; `e2e/egress-realtime-idle.spec.js` lee su ruta |
| | `components/notifications/in-app-notifications-coordinator.jsx` | 58 | `DashboardLayout.jsx` |
| Payload | `lib/notificacion-payload.ts` | 28 | `in-app-notifications.js` |
| Recordatorios | `lib/reminder-digest.js` | 92 | `sync-provider.jsx` |
| | `lib/schedule-reminder-push.js` | 62 | `actions/calendar.js`, `actions/sales.js` |
| API | `lib/notifications-api.js` | 35 | `onesignal.js`, `push-notifications.js`, digest, schedule |
| Ajustes | `components/settings/notifications-settings.jsx` | 351 | `settings-page.tsx` (lazy) |
| OneSignal / optIn (no se mueve) | `lib/onesignal.js` 1277, `lib/push-enable.js` 237, `lib/push-prompt.js` 78, `lib/push-notifications.js` 40, `onesignal-provider.jsx` 133, `push-permission-prompt.jsx` 143, `auto-push-coordinator.jsx` 78 | | |
| Compartidos con optIn (no se mueven) | `lib/desktop-notifications.js` 127, `lib/notification-sound.js` 90, `lib/collab-remote-notify.js` 72 | | |

Acoplamientos reales: el in-app lee preferencias de `useDbStore`; Ajustes recibe `settings` y guarda vía `settings-page.tsx` (perfil y `cloud-persist`, fuera); Realtime depende de `lib/supabase/*` y `presence/realtime`; agenda y ventas programan recordatorios con `scheduleReminderPush`; `sync-provider.jsx` dispara digest y flush.

---

## 1. Lista real de archivos

### Dominio / lógica de recordatorios

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/api/src/lib/reminders.js` | 62 | `collectReminders` / `extractReminderTime` desde `db.cal` + `processDate` |
| `apps/api/src/services/reminders-service.js` | 6 | Fachada → `collectReminders` |
| `apps/web/src/lib/schedule-reminder-push.js` | 69 | Fecha/hora local → ISO → `POST schedule-reminder` |
| `apps/web/src/lib/reminder-digest.js` | 75 | Digest + flush poll (~45s); claves `sts4_reminder_*` |
| `apps/web/src/lib/notificacion-payload.ts` | 163 | Tipos in-app + `armarNotificacion` |
| `apps/web/src/lib/in-app-notifications.js` | 354 | Prefs, bridge `PushType` → tipo, `presentarNotificacion` |
| `packages/shared/src/push/notification-targets.js` | 104 | `PushType` + deep links + `resolvePushPathFromPayload` |

### UI (toasts, ajustes; sin centro dedicado)

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/web/src/components/settings/notifications-settings.jsx` | 325 | Activar/desactivar push + prefs |
| `apps/web/src/components/notifications/push-permission-prompt.jsx` | 131 | Banner permiso |
| `apps/web/src/components/notifications/auto-push-coordinator.jsx` | 66 | Auto-solicitud en gesto |
| `apps/web/src/components/notifications/in-app-notifications-coordinator.jsx` | 50 | Arranca/para Realtime in-app |
| `apps/web/src/components/ui/toaster.jsx` | 174 | Centro visual de toasts |
| `apps/web/src/lib/toast.ts` | 59 | API toast |
| `apps/web/src/lib/desktop-notifications.js` | 113 | Notificación nativa desktop (pestaña en background) |
| `apps/web/src/lib/notification-sound.js` | 80 | Sonido in-app |
| `apps/web/src/components/calendar/entry-dialog.jsx` | 205 | UI fecha/hora recordatorio en agenda |
| `apps/web/src/components/settings/settings-page.tsx` | (parcial) | Hub → sección notifications |
| `apps/web/src/layouts/DashboardLayout.jsx` | 64 | Monta OneSignal + coordinators |

### Integración OneSignal

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/web/src/lib/onesignal.js` | ~1144 | Init, SW scope, optIn, login, deep link click, `__diagnosePush` |
| `apps/web/src/components/providers/onesignal-provider.jsx` | 112 | Provider de sesión |
| `apps/web/src/lib/push-enable.js` | 215 | Flujo “Activar” |
| `apps/web/src/lib/push-prompt.js` | 67 | Estado banner / bloqueo permanente |
| `apps/web/src/lib/push-notifications.js` | 36 | Registro device vía API |
| `apps/web/src/lib/notifications-api.js` | 34 | Cliente `/api/v1/notifications/*` |
| `apps/api/src/services/push-notifications-service.js` | ~744 | Envío OS, digest, schedule, flush, prefs, `onesignal_subscription_ids` |
| `apps/api/src/controllers/notifications-controller.js` | 39 | HTTP → servicio |

### Service worker / PWA

| Path | Notas |
|------|-------|
| `public/onesignal/OneSignalSDKWorker.js` | Entry: `importScripts("./OneSignalSDK.sw.js")` |
| `public/onesignal/OneSignalSDK.sw.js` | Runtime SW OneSignal (~39 KB) |
| `public/onesignal/OneSignalSDK.page.js` | Loader page SDK |
| `public/onesignal/OneSignalSDK.page.es6.js` | SDK page (~137 KB) |
| `public/OneSignalSDKWorker.js` | Legacy root → `/onesignal/OneSignalSDK.sw.js` |
| `apps/web/src/lib/pwa-register.js` | Vite PWA `registerSW` (scope `/`, distinto de OS) |
| `apps/web/src/lib/pwa-install.js` | Detecta plataforma / iOS PWA |
| `apps/web/vite.config.js` | Workbox: NetworkOnly para OneSignal; PWA `scope: "/"` |
| `vercel.json` | Headers `/onesignal/*`, `/OneSignalSDKWorker.js`, `/sw.js` |

### API (rutas / servicios / jobs)

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/api/src/routes/reminders.js` | 6 | `GET /reminders` |
| `apps/api/src/routes/notifications.js` | 20 | config/status/device/digest/schedule/flush |
| `apps/api/src/routes/cron.js` | 27 | `GET\|POST /cron/flush-reminders` |
| `apps/api/src/controllers/reminders-controller.js` | 9 | Listado |
| `apps/api/src/routes/v1.js` | — | Montaje + catálogo de paths |
| `supabase/migrations/0033_scheduled_push_jobs.sql` | 34 | Tabla cola |
| `supabase/migrations/0020_push_subscriptions.sql` | 24 | **Legacy** (ya no contrato activo) |
| `supabase/migrations/0040_realtime_social_notifications.sql` | 19 | Realtime DM/connections/shares |

### PushType / deep links

| Path | ~líneas |
|------|--------:|
| `packages/shared/src/push/notification-targets.js` | 104 |
| `scripts/architecture/check-push-deeplinks.mjs` | 197 |

### i18n

| Path | Claves relevantes |
|------|-------------------|
| `apps/web/src/lib/i18n-catalog.js` | `settings.notifications.*`, `pushPrompt.*`, `toast.*` |
| `apps/web/src/lib/i18n-phase2-catalog.js` | `entry.reminder.*`, `exp.note.reminder*` |

### Tests / verify / smoke

| Path | Qué cubre |
|------|-----------|
| `scripts/architecture/check-push-deeplinks.mjs` | PushType → path → rutas SPA (en `verificar:arquitectura:checks`) |
| `apps/api/src/mvc-contract.test.mjs` | Incluye `/api/v1/cron/flush-reminders` |
| `apps/api/scripts/verify-smoke.mjs` | `GET /api/v1/reminders` → 401/503 |
| `scripts/verify-vps-mobile.mjs` | `notifications/config` sin auth |
| `e2e/egress-realtime-idle.spec.js` | Idle egress; referencia in-app realtime |

**No hay** e2e Playwright de optIn OneSignal / entrega push en dispositivo.

### Acoplados (no son el módulo, pero críticos)

`settings-scope.js`, `storage/keys.ts`, `types.ts`, `sync-provider.jsx`, `actions/calendar.js`, `actions/sales.js`, `lib/in-app-notifications-realtime.js`, servicios API de sharing/chat/network/support/auth que emiten push.

---

## 2. Contratos que **no** se renombran

### `PushType` (valores wire)

| Constante | Valor |
|-----------|-------|
| `MESSAGE` | `message` |
| `CONNECTION_REQUEST` | `connection_request` |
| `CONNECTION_ACCEPTED` | `connection_accepted` |
| `SHARED_PROSPECT` | `shared_prospect` |
| `PROSPECT_SECTION_CHANGED` | `prospect_section_changed` |
| `CLOSER_ASSIGNED` | `closer_assigned` |
| `PROSPECT_TRANSFERRED` | `prospect_transferred` |
| `FOLLOW_UP_REMINDER` | `follow_up_reminder` |
| `SALES_TO_PROCESS` | `sales_to_process` |
| `SCHEDULED_NOTE` | `scheduled_note` |
| `SESSION_REVOKED` | `session_revoked` |
| `SUPPORT_REPLY` | `respuesta_soporte` |

Deep links asociados (ejemplos): `/login`, `/network`, `/`, `/sales`, `/settings`, `/messages?with=…`, `/clients/…`, `/red/contacto/…/expediente/…`.

### Rutas HTTP

- `GET /api/v1/reminders?from=&to=`
- `GET /api/v1/notifications/config|status|push-diagnostics`
- `POST /api/v1/notifications/device|digest-reminders|schedule-reminder|flush-reminders`
- `GET|POST /api/v1/cron/flush-reminders`

Config push: `serviceWorkerPath: "onesignal/OneSignalSDKWorker.js"`, `serviceWorkerScope: "/onesignal/"`, `provider: "onesignal"`.

### Tablas / columnas / settings

- `scheduled_push_jobs`: `user_id`, `send_at`, `push_type`, `title`, `body`, `path`, `tag`, `entry_key`, `status`, `attempts`, …
- `profiles.settings.onesignal_subscription_ids`
- Prefs `profiles.settings.notifications.*`: `messages`, `connection_requests`, `connection_accepted`, `shared_prospects`, `follow_up_reminders`, `sales_to_process`, `scheduled_notes`
- `push_subscriptions` — legacy; no usar como contrato activo

### Claves `sts4_*`

- `sts4_user_v1` (prefs usuario: `notifications`, `onesignal_subscription_ids`)
- `sts4_reminder_digest_at`, `sts4_reminder_flush_at`

### OneSignal / env

- `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_SAFARI_WEB_ID` / `VITE_ONESIGNAL_SAFARI_WEB_ID`
- Paths: `/onesignal/OneSignalSDKWorker.js`, scope `/onesignal/`
- API: `https://api.onesignal.com/notifications`

### Permisos / i18n

- Permiso: `notificaciones:configurar_propias`
- Prefijos i18n: `settings.notifications.*`, `pushPrompt.*`, `entry.reminder.*`, `exp.note.reminder*`

### Tipos in-app (paralelos; no renombrar al azar)

`mensaje_nuevo`, `solicitud_contacto`, `solicitud_aceptada`, `expediente_compartido`, `cerrador_asignado`, `followup_pendiente`, `venta_pendiente`, `nota_programada`, `respuesta_soporte`.

---

## 3. Acoplamientos

| Dominio | Cómo |
|---------|------|
| **Agenda** | `actions/calendar.js` + `entry-dialog` → `scheduleReminderPush`; API `collectReminders` lee `db.cal` (`follow`/`nota`) |
| **Ventas** | `actions/sales.js` + `processDate` → digest `SALES_TO_PROCESS` / schedule |
| **Metas** | Sin acoplamiento push/recordatorios |
| **Expediente / red / chat** | sharing, participants, chat, network, tools → push + Realtime in-app |
| **Auth / sesión** | `SESSION_REVOKED` → `/login`; OneSignal `external_id` = UUID usuario |
| **Sync** | `sync-provider`: tras sync/foreground → digest + flush loop |
| **Settings scope** | `notifications` + `onesignal_subscription_ids` = globales de usuario |
| **Soporte** | `SUPPORT_REPLY` / `respuesta_soporte` |
| **PWA** | Dos SW: Workbox `/` vs OneSignal `/onesignal/` |

---

## 4. Riesgos del service worker

### Qué **no** mover (rompe registro / scope / Dashboard)

1. URLs públicas fijas: `/onesignal/OneSignalSDKWorker.js`, `.sw.js`, `.page.js`, legacy `/OneSignalSDKWorker.js`
2. Scope `/onesignal/` (código + respuesta `notifications/config` + Dashboard Site URL)
3. Separación de scopes: si OS se registra en `/`, choca con Workbox `sw.js`
4. Exclusiones Workbox NetworkOnly de `OneSignalSDK*` en `vite.config.js`
5. Rewrites/headers SPA (`vercel.json` / Nginx) que excluyen `onesignal/` del fallback a `index.html`

### Pruebas automáticas vs dispositivo real

| Automatizable (CI/local) | Requiere dispositivo / PWA real |
|--------------------------|----------------------------------|
| `check-push-deeplinks.mjs` | OptIn + permiso Notification |
| Smoke `GET /reminders` 401, `notifications/config` | Entrega FCM/APNs en background |
| `mvc-contract` path cron flush | Android PWA instalada |
| Unit futuros: `collectReminders`, `resolvePushPath`, `armarNotificacion` | Click push → deep link con app cerrada |
| E2E egress idle (no es push) | iOS solo desde icono home; `__diagnosePush()` |

---

## 5. Plan por tramos (propuesta)

Patrón repo: **B = dominio puro + tests**; **A = `git mv` a `modulos/` + fachada**; API con paths HTTP congelados.

### B — puro (sin dispositivo)

Extraer/testear sin I/O:
- `collectReminders` / `extractReminderTime`
- `resolvePushPathFromPayload` + tabla PushType (ya parcialmente en `check-push-deeplinks`)
- `localReminderToIso` / cooldowns digest-flush
- `armarNotificacion` / mapeo prefs

**Verify:** `verificar:arquitectura:checks`, units nuevos, smoke 401 reminders/config.

### A — mover web UI/lib (sin renombrar contratos)

Candidatos a p.ej. `apps/web/src/modulos/notificaciones/` (fachada):
- UI: settings notifications, prompts, coordinators (toaster puede quedarse como UI genérica)
- Lib: `in-app-notifications*`, `reminder-digest`, `schedule-reminder-push`, `notificacion-payload`, `notifications-api`, `push-enable`, `push-prompt`, `desktop-notifications`, `notification-sound`

**NO mover en A (o solo reexportar constantes):**
- `public/onesignal/**`, `public/OneSignalSDKWorker.js`
- `SW_PATH` / `SW_SCOPE` / URLs SDK
- `vite.config.js` workbox + headers deploy
- `packages/shared/.../notification-targets.js` (contrato compartido)
- Claves `sts4_*`, columnas SQL, paths `/api/v1/*`

**Verify sin dispositivo:** build web CI, deeplinks, smoke config/reminders — **no** sustituye prueba push móvil.

### API

Mover a `apps/api/src/modulos/...` manteniendo montaje en `v1.js`:
- reminders + notifications controllers/routes/services, `lib/reminders.js`, cron flush

**Verify:** `mvc-contract`, smoke reminders/config, cron con secret; digest/flush con mock de envío OS.

### Orden sugerido

1. B dominio + tests + deeplinks  
2. A UI/lib web detrás de fachada  
3. API MVC  
4. **No mover / último y con cuidado extremo:** OneSignal SW + PWA + linking de auth

### Checklist sin dispositivo (post-tramo)

- `npm run verificar:arquitectura:checks`
- `npm run verify` / smoke API
- Build web CI
- Units de dominio puro

### Checklist solo con dispositivo

- Activar en Ajustes → Notificaciones (Android PWA / Chrome desktop)
- Programar follow-up con hora → flush (~45s o cron)
- Click notificación → deep link
- Logout remoto → `session_revoked`
