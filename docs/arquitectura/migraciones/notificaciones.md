# Módulo 7 — notificaciones (web)

**Tramo B** (`503928f`, en `main` y desplegado en la API): dominio puro en `apps/web/src/modulos/notificaciones/dominio/` y `apps/api/src/modulos/notificaciones/`.
**Tramo A** (`61b223f` en `main`, deploy web-only 2026-10-19): UI, servicios y cliente HTTP del lado web en el módulo. Sin cambios en la API (`72a3ca4`), en la BD ni en contratos.

Inventario de partida: [`notificaciones-inventario.md`](./notificaciones-inventario.md).

---

## 1. Estructura

```text
apps/web/src/modulos/notificaciones/
  index.ts              # fachada completa (UI, servicios, dominio, tipos)
  fachada-node.js       # dominio + cliente HTTP, sin UI, TS ni alias @/ (tests de node y shims de lib/)
  fachada-toast.js      # solo el emisor de toasts (entrada delgada)
  api/                  # notifications-api.js (+ test de contrato)
  dominio/              # puro, con tests
  servicios/            # toast, in-app, Realtime in-app, digest/flush, programación de recordatorios
  ui/                   # Toaster, coordinador in-app, Ajustes → Notificaciones
```

## 2. Archivos movidos (`git mv`, Paso A)

| Antes (`apps/web/src/`) | Ahora (`modulos/notificaciones/`) |
|-------------------------|-----------------------------------|
| `components/ui/toaster.jsx` | `ui/toaster.jsx` |
| `components/notifications/in-app-notifications-coordinator.jsx` | `ui/in-app-notifications-coordinator.jsx` |
| `components/settings/notifications-settings.jsx` | `ui/notifications-settings.jsx` |
| `lib/toast.ts` | `servicios/toast.ts` |
| `lib/in-app-notifications.js` | `servicios/in-app-notifications.js` |
| `lib/in-app-notifications-realtime.js` | `servicios/in-app-notifications-realtime.js` |
| `lib/reminder-digest.js` | `servicios/reminder-digest.js` |
| `lib/schedule-reminder-push.js` | `servicios/schedule-reminder-push.js` |
| `lib/notifications-api.js` | `api/notifications-api.js` |
| `lib/notificacion-payload.ts` | `dominio/notificacion-payload.ts` |
| `modulos/notificaciones/index.js` | `index.ts` |

Consumidores actualizados a `@/modulos/notificaciones`: `components/providers/sync-provider.jsx` (Toaster, digest y flush), `layouts/DashboardLayout.jsx` (coordinador in-app), `components/settings/settings-page.tsx` (Ajustes), `actions/calendar.js` y `actions/sales.js` (`scheduleReminderPush`). Dentro del módulo los imports son relativos. `e2e/egress-realtime-idle.spec.js` lee la nueva ruta del servicio Realtime.

**Shims en `lib/`** (una línea; la carpeta sigue congelada y el baseline los conserva):

- `lib/toast.ts` → `fachada-toast.js`. Unos 40 consumidores genéricos de toasts (incluido `push-enable.js`) siguen importando `@/lib/toast`; migrarlos es deuda de bajo riesgo.
- `lib/notifications-api.js` → `fachada-node.js`. Lo usan `lib/onesignal.js` y `lib/push-notifications.js` (flujo de suscripción), que no se tocan.

**Por qué hay una fachada delgada para toasts:** si el shim reexporta desde `index.ts`, cualquier archivo que emite un toast arrastra en su grafo el Toaster (`lucide-react`), el servicio Realtime (`@supabase/ssr`) y Ajustes (que importa `onesignal.js`). Con eso fallaban los tests de moneda, survey y vacaciones (que empaquetan con esbuild) y se formaba un ciclo `onesignal.js` → fachada → Ajustes → `onesignal.js`. `fachada-toast.js` se añadió a `isFacadeRest` en [`check-module-facades.mjs`](../../../scripts/architecture/check-module-facades.mjs), como `fachada-i18n.js` y `fachada-preguntas.js`.

## 3. Lógica pura extraída (Paso B, copia literal)

| Archivo | Exporta | Origen |
|---------|---------|--------|
| `dominio/datos-respaldo-push.js` | `datosRespaldoDesdePush(tipo, { title, body, path, avatarUrl })` | `buildFallbackData` y sus parsers de rutas y textos (`in-app-notifications.js`) |
| `dominio/presentacion-toast.js` | `VENTANA_AGRUPACION_MS` (30 s), `TONO_POR_ICONO`, `iconoToastDesdePayload`, `claveAgrupacion`, `opcionesToastDesdePayload` | mapas de iconos, clave de agrupación y opciones del toast in-app; tonos del Toaster |
| `dominio/item-toast.js` | `MAX_TOASTS_VISIBLES` (3), `duracionToast`, `toastEsVacio`, `armarItemToast` | normalización del item del Toaster |
| `dominio/programacion-recordatorio.js` | `armarProgramacionRecordatorio(entrada, ahoraMs)` | cuerpo de `POST /notifications/schedule-reminder` (`schedule-reminder-push.js`) |

El registro de agrupación (estado), los timers del Toaster y las llamadas a red siguen en `servicios/` y `ui/`.

## 4. Lo que no se movió (deuda declarada)

| Archivo | Motivo |
|---------|--------|
| `lib/onesignal.js`, `lib/push-enable.js`, `lib/push-prompt.js`, `lib/push-notifications.js` | SDK de OneSignal, optIn, registro de `onesignal_subscription_ids` |
| `components/providers/onesignal-provider.jsx`, `components/notifications/push-permission-prompt.jsx`, `components/notifications/auto-push-coordinator.jsx` | Montaje del SDK y flujo de permiso |
| `lib/desktop-notifications.js`, `lib/notification-sound.js` | Notification API y activación de escritorio; los usa también el optIn |
| `lib/collab-remote-notify.js` | Avisos de colaboración del expediente |
| `packages/shared/src/push/notification-targets.js` | Contrato compartido (`PushType`, deep links) |
| `public/onesignal/**`, `public/OneSignalSDKWorker.js`, Workbox y cabeceras | Service worker y scope `/onesignal/` |

Ningún archivo de esta tabla cambió en el Tramo A.

## 5. Acoplamientos

| Con | Cómo |
|-----|------|
| Agenda / ventas | `actions/calendar.js` y `actions/sales.js` → `scheduleReminderPush` (fachada); `processDate` y `db.cal` siguen fuera |
| Expediente / red / chat / soporte | El servicio Realtime escucha `direct_messages`, `chat_messages`, `user_connections`, `prospect_shares` y `support_request_replies`; `collab-remote-notify.js` emite toasts |
| Auth / sesión | Realtime usa `lib/supabase/client`, `ensure-browser-session` y `presence/realtime`; `session_revoked` lo maneja `onesignal.js` |
| Sync / persistencia | Las preferencias se leen de `useDbStore` (`db.settings.notifications`); Ajustes recibe `settings` y `onNotificationsChange` de `settings-page.tsx`, y el guardado (perfil, `cloud-persist`) queda fuera del módulo. `sync-provider.jsx` dispara digest y flush tras sincronizar |
| PWA | `getInstallPlatform()` (`lib/pwa-install.js`) decide escritorio o móvil |

## 6. Contratos sin cambio

`PushType` y sus valores, deep links, rutas `/api/v1/reminders`, `/api/v1/notifications/*` y `/api/v1/cron/flush-reminders`, prefs `notifications.*` (claves y defaults), `sts4_reminder_digest_at` y `sts4_reminder_flush_at`, `onesignal_subscription_ids`, app id y scope de OneSignal, claves i18n, tipos in-app y forma de `scheduled_push_jobs`. Los fijan [`dominio/contratos-notificaciones.test.mjs`](../../../apps/web/src/modulos/notificaciones/dominio/contratos-notificaciones.test.mjs) y [`api/notifications-api.test.mjs`](../../../apps/web/src/modulos/notificaciones/api/notifications-api.test.mjs), además de `check-push-deeplinks.mjs`.

## 7. Caracterización

- **Golden master** (fuera del repo, Node con un loader que resuelve `@/` y sustituye store, plataforma, sonido, notificación de escritorio, config de Supabase y API por grabadores): 120 casos in-app (cada tipo en escritorio y móvil, agrupación con reloj controlado, cinco juegos de preferencias, puente legacy y un caso por `PushType`), 10 de programación de recordatorios (incluidos sin conexión, `prefs_off` y error), 11 de digest/flush/loop y el contrato `fetch` del cliente HTTP. Salida idéntica byte a byte antes del Paso B, después del Paso B y después del Paso A.
- **Tests en el repo** (en `test:web`, Node 20 sin TS): contratos, extracciones del Paso B y cliente HTTP, más el test del Tramo B.
- **Build:** mismos chunks que `main`; el chunk principal crece 478 bytes y Ajustes sigue en su chunk lazy (`settings-page`).
- **Hallazgo (no corregido):** `presentarNotificacion("expediente_transferido")` lanza "Tipo de notificación no soportado", porque `armarNotificacion` no tiene ese tipo. Hoy no se alcanza: el puente de push devuelve `false` antes (el respaldo no tiene caso para ese tipo) y Realtime no lo emite. Queda caracterizado tal cual.

## 8. Verificación

Comandos: `npm run verificar:arquitectura:completo` (con `dev:api` y `dev:web` arriba), `npm run test:security`, `npm run test:web`, `npm run test:e2e` con `CI=true`, las suites de metas, vacaciones, survey, money-box, moneda, geo-fx y rh-regalos, [`smoke-notificaciones-ui-qa.mjs`](../../../scripts/architecture/smoke-notificaciones-ui-qa.mjs) y el gate [`smoke-survey-collab-e2e-qa.mjs`](../../../scripts/architecture/smoke-survey-collab-e2e-qa.mjs).

El smoke de notificaciones usa dos cuentas QA efímeras y comprueba:

- el toast simple;
- el toast in-app real por Realtime al compartir un expediente;
- el cambio de preferencia persistido tras recargar y en `profiles.settings`;
- la fila de `scheduled_push_jobs` creada desde la agenda, normalizada (sin `entry_key`) e idéntica a la que produce `main`;
- la purga a 0 de ambas cuentas.

**No verificable sin dispositivo** (y no tocado): optIn de OneSignal, entrega push real, deep link con la app cerrada, service worker y PWA instalada.

## 9. Reversión

Antes del merge: descartar la rama. Después del merge: `git revert` de los commits del Tramo A (sin force) y redeploy del web. No hay cambios de API ni de BD que revertir.
