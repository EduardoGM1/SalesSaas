# Módulo 7 — notificaciones

**Tramo B** (`503928f`, en `main` y desplegado en la API): dominio puro en `apps/web/src/modulos/notificaciones/dominio/` y `apps/api/src/modulos/notificaciones/`.
**Tramo A** (`61b223f` en `main`, deploy web-only 2026-10-19): UI, servicios y cliente HTTP del lado web en el módulo. Sin cambios en la API (`72a3ca4`), en la BD ni en contratos.
**Tramo C** (rama `arquitectura/modulo-notificaciones-api`): API HTTP (rutas, controladores, servicios, repositorio) en `apps/api/src/modulos/notificaciones/`. Sin cambios de BD, sin diff en `apps/web`, sin deploy hasta OK explícito.

Inventario de partida: [`notificaciones-inventario.md`](./notificaciones-inventario.md).

---

## 1. Estructura

### Web (Tramo A)

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

### API (Tramo C)

```text
apps/api/src/modulos/notificaciones/
  index.js                 # fachada: routers + dominio + notify* / schedule / flush
  fachada-node.js          # dominio + push sin montar Express
  dominio/                 # construir-recordatorios, prefs, mapeo PushType, trabajo programado, etiqueta-push, payload-onesignal
  servicios/               # push-notificaciones.js, recordatorios-servicio.js
  controladores/           # notificaciones-controlador.js, recordatorios-controlador.js
  rutas/                   # reminders.js, notifications.js, cron-flush-reminders.js
  repositorio/             # perfil-push-repositorio.js, trabajos-push-repositorio.js
```

---

## 2. Archivos movidos (`git mv`, Paso A)

### Web (Tramo A)

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

### API (Tramo C)

| Antes (`apps/api/src/`) | Ahora (`modulos/notificaciones/`) |
|-------------------------|-----------------------------------|
| `routes/reminders.js` | `rutas/reminders.js` |
| `routes/notifications.js` | `rutas/notifications.js` |
| `controllers/reminders-controller.js` | `controladores/recordatorios-controlador.js` |
| `controllers/notifications-controller.js` | `controladores/notificaciones-controlador.js` |
| `services/reminders-service.js` | `servicios/recordatorios-servicio.js` |
| `services/push-notifications-service.js` | `servicios/push-notificaciones.js` |
| `lib/reminders.js` | eliminado (aliases `collectReminders` / `extractReminderTime` en la fachada) |

`GET|POST /cron/flush-reminders` sale a `rutas/cron-flush-reminders.js`. El resto de crons (support, RH, tombstones) sigue en `routes/cron.js`. Montaje en `routes/v1.js` vía fachada (`remindersRouter`, `notificationsRouter`, `cronFlushRemindersRouter`).

Consumidores de `notify*` actualizados a `../modulos/notificaciones/index.js`: chat, messages, network, sharing, prospect-participants, tools, support (dynamic import), auth-controller.

**Baseline de contención:** 403 → 396 (−7 archivos API movidos/eliminados). `routes/cron.js` y `lib/cron-auth.js` permanecen en legacy (otras tareas / infra compartida).

---

## 3. Lógica pura extraída (Paso B)

### Web (Tramo A)

| Archivo | Exporta | Origen |
|---------|---------|--------|
| `dominio/datos-respaldo-push.js` | `datosRespaldoDesdePush(tipo, { title, body, path, avatarUrl })` | `buildFallbackData` y sus parsers de rutas y textos (`in-app-notifications.js`) |
| `dominio/presentacion-toast.js` | `VENTANA_AGRUPACION_MS` (30 s), `TONO_POR_ICONO`, `iconoToastDesdePayload`, `claveAgrupacion`, `opcionesToastDesdePayload` | mapas de iconos, clave de agrupación y opciones del toast in-app; tonos del Toaster |
| `dominio/item-toast.js` | `MAX_TOASTS_VISIBLES` (3), `duracionToast`, `toastEsVacio`, `armarItemToast` | normalización del item del Toaster |
| `dominio/programacion-recordatorio.js` | `armarProgramacionRecordatorio(entrada, ahoraMs)` | cuerpo de `POST /notifications/schedule-reminder` (`schedule-reminder-push.js`) |

### API (Tramo B + C)

| Archivo | Exporta | Origen |
|---------|---------|--------|
| `dominio/construir-recordatorios.js` | `construirRecordatorios`, `extraerHoraRecordatorio` | `lib/reminders.js` (Tramo B) |
| `dominio/preferencias-notificacion.js` | normalización / omisiones por prefs | servicio push (Tramo B) |
| `dominio/mapeo-pushtype.js` | reexport shared + aliases | shared (Tramo B) |
| `dominio/trabajo-push-programado.js` | clasificación, `evaluarSendAt`, `construirCamposTrabajoPush` | schedule (Tramo B) |
| `dominio/etiqueta-push.js` | `construirEtiquetaPush` | `pushTag` (Tramo C) |
| `dominio/payload-onesignal.js` | `construirPayloadMensajeOnesignal` | `buildMessagePayload` (Tramo C) |

OneSignal (`postOneSignal` / `sendToUser`), cooldown DB y SQL de `scheduled_push_jobs` / `profiles.settings` quedan en `servicios/` + `repositorio/`.

---

## 4. Lo que no se movió (deuda declarada)

| Archivo | Motivo |
|---------|--------|
| Web: `lib/onesignal.js`, optIn, SW, `public/onesignal/**` | SDK / scope `/onesignal/` |
| Web: `lib/desktop-notifications.js`, `lib/notification-sound.js`, `lib/collab-remote-notify.js` | Compartidos con optIn / collab |
| `packages/shared/src/push/notification-targets.js` | Contrato compartido |
| API: `lib/cron-auth.js`, resto de `routes/cron.js` | Infra cron compartida |
| Tablas / columnas / `CRON_SECRET` / app id OneSignal | Contratos congelados |

---

## 5. Acoplamientos (API, Tramo C)

| Con | Cómo |
|-----|------|
| Agenda / ventas | `collectReminders` lee `db.cal` + `processDate` vía sync blob; schedule desde web |
| Chat / red / sharing / tools / support / auth | `notify*` desde la fachada del módulo |
| Sync | `recordatorios-servicio` → `sync-service.obtenerBaseDatosUsuario` |
| Cron externo | `authorizeCron` + `CRON_SECRET` en `cron-flush-reminders` |

---

## 6. Contratos sin cambio

`PushType` y valores, deep links (`calendarPath()` → `/`), rutas `/api/v1/reminders`, `/api/v1/notifications/*`, `/api/v1/cron/flush-reminders`, prefs `notifications.*`, `sts4_reminder_*`, `onesignal_subscription_ids`, OneSignal app id / scope, claves i18n, forma de `scheduled_push_jobs`. Config push: `serviceWorkerPath: "onesignal/OneSignalSDKWorker.js"`, `serviceWorkerScope: "/onesignal/"`.

---

## 7. Caracterización (Tramo C)

- Golden masters Tramo B (`construir-recordatorios.test.mjs`) + etiquetas/payload OneSignal (`etiqueta-push.test.mjs`) — byte a byte.
- `test:security` (incluye `mvc-contract` con path cron flush) verde antes y después del move.
- Contratos HTTP locales (QA efímera, backend real): 401 sin sesión en reminders/notifications/cron; 200 con cookie en reminders/config; `schedule-reminder` inserta fila con `push_type`, `title`, `body`, `path`, `tag`, `entry_key`, `status`, `send_at` idénticos a la lógica de `main`; cron flush sobre fila `pending` vencida → `checked:1`, `attempts` 0→1 (sin dispositivo: reintento, no `sent`); purga a 0 de las tablas pedidas.

---

## 8. Verificación

Comandos: `npm run verificar:arquitectura:completo` (con `dev:api` y `dev:web` arriba), `npm run test:security`, `npm run test:web`, `npm run test:e2e` con `CI=true`, suites metas/vacaciones/survey/money-box/moneda/geo-fx/rh-regalos, gate collab.

**No verificable sin dispositivo:** optIn OneSignal, entrega push real, deep link con app cerrada, service worker / PWA.

---

## 9. Reversión

Antes del merge: descartar la rama. Después del merge: `git revert` del commit del Tramo C (sin force) y redeploy de la API (web no cambia). No hay cambios de BD.
