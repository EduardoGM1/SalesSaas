# Backend — Supabase

Guía para conectar la app a Supabase. Mientras no haya credenciales, la app
sigue funcionando con almacenamiento local (sin login ni nube).

## 1. Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Guarda la contraseña de la base de datos.
3. Espera a que se aprovisione.

## 2. Aplicar el esquema

Opción A — **SQL Editor** (más rápido):

1. Supabase → **SQL Editor** → **New query**.
2. Pega el contenido de [`migrations/0001_initial_schema.sql`](./migrations/0001_initial_schema.sql).
3. **Run**.

Opción B — **Supabase CLI**:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## 3. Configurar variables de entorno

1. Copia `.env.example` a `.env.local` (en `sales-app/`).
2. Rellena con **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)
   - `DATABASE_URL` (**Project Settings → Database → Connection string**)

## 4. Autenticación

1. **Authentication → Providers**: deja **Email** habilitado.
2. (Opcional) **Google**: pega `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` y
   añade la URL de callback que indique Supabase en Google Cloud Console.
3. **Authentication → URL Configuration**:
   - Site URL: tu dominio de producción (ej. `https://sales-saas-api.vercel.app`).
   - Redirect URLs (añadir todas las que uses):
     - `http://localhost:5173/auth/callback`
     - `https://sales-saas-api.vercel.app/auth/callback`
   - El enlace de recuperación de contraseña redirige a `/auth/callback?next=/reset-password`.

## 4b. Realtime Presence (estado en línea en Red)

Requisitos para que los contactos vean **En línea** (punto verde):

### SQL (migraciones obligatorias)

Ejecuta en **SQL Editor** (en orden):

1. `0012_user_network_mvp.sql` — tabla `user_connections` y función `users_are_connected`
2. `0015_user_presence.sql` — `last_seen_at` + políticas en `realtime.messages`
3. `0016_realtime_messages_rls.sql` — `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`
4. `0017_fix_presence_rls.sql` — corrige sintaxis RLS y grants para canales private
5. `0018_presence_realtime_grants.sql` — grants en schema `realtime` + función `can_access_presence_topic`
6. `0019_presence_listen_policy_fix.sql` — corrige política SELECT (sin filtro `extension` en join)

Verifica políticas:

```sql
select policyname from pg_policies where tablename = 'messages' and schemaname = 'realtime';
```

Debes ver `presence_track_own` y `presence_listen_contacts`.

### Dashboard Supabase

1. **Project Settings → Realtime**
   - Realtime activado.
   - Para canales **private** (los que usa la app): desactiva **Allow public access**  
     (o mantén políticas RLS correctas; con `private: true` se evalúan las políticas).

2. **Authentication → URL Configuration**  
   - Tu URL de Vercel en Site URL y Redirect URLs (ver sección 4).

### En la app (dos cuentas de prueba)

1. Ambas cuentas deben ser **contactos aceptados** (no solo solicitud pendiente).
2. Ambas deben tener la **app abierta** al mismo tiempo (pestaña activa).
3. Variables en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

### Depuración

Abre la consola del navegador (F12). Si falla la autorización verás:

- `[presence] Canal no autorizado o error: presence:user:... CHANNEL_ERROR`

Eso indica migraciones pendientes, JWT sin enviar a Realtime, o contacto no aceptado.

### Escalabilidad (~50 usuarios en línea)

| Recurso | Uso actual | ¿Necesitas cambiar algo? |
|---------|------------|--------------------------|
| **WebSockets** (Max concurrent clients: 200) | 1 por pestaña activa → ~50 con 50 usuarios | No, margen suficiente |
| **Canales por usuario** | 1 propio + 1 por contacto aceptado | OK hasta ~50 contactos/usuario |
| **Pool DB Realtime** (valor 2 en dashboard) | Conexiones internas para evaluar RLS al unirse | Con 50 usuarios puede haber latencia al conectar; en Pro puedes subirlo |
| **Triggers SQL** | No se usan para “en línea” | No hacen falta; presencia es Realtime |
| **`last_seen_at`** | Solo al cerrar sesión (`POST /presence/offline`) | No requiere trigger; es “última desconexión” |

No hace falta aumentar el límite de clientes para 50 usuarios. Sí asegura migraciones 0015–0019 y redespliegue del frontend.

## 4c. Notificaciones push con OneSignal

Las notificaciones usan [OneSignal](https://onesignal.com) (plan gratuito hasta ~10.000 suscriptores web).

### OneSignal Dashboard

1. Crea una app **Web** en OneSignal.
2. Configura el sitio con **Custom Code** (no WordPress).
3. Sube o verifica que `https://tu-dominio.com/onesignal/OneSignalSDKWorker.js` sea accesible.
4. En **Settings → Keys & IDs** copia:
   - **OneSignal App ID**
   - **REST API Key**

### Variables de entorno (Vercel + `.env.local`)

```
ONESIGNAL_APP_ID=tu-app-id
ONESIGNAL_REST_API_KEY=tu-rest-api-key
VITE_ONESIGNAL_APP_ID=tu-app-id
```

### En la app

1. **Configuración → Notificaciones → Activar notificaciones**.
2. En iPhone: instala la PWA en la pantalla de inicio (iOS 16.4+) y abre desde el icono.
3. Eventos con push: mensaje nuevo, solicitud de contacto, solicitud aceptada, **sesión cerrada en otro dispositivo**.

> La tabla `push_subscriptions` (migración 0020) ya no se usa; OneSignal gestiona los dispositivos vinculados por `external_id` (UUID de Supabase) y por `subscription_id` guardados en `profiles.settings.onesignal_subscription_ids`.

### Diagnóstico Android ("No recipients" / no llegan push)

**Síntoma A — bienvenida sí, envíos de la app no:** el push de confirmación OneSignal llega, pero los envíos posteriores muestran *No recipients*. Causa típica: `external_id` no vinculado (ver sección de vínculo más abajo).

**Síntoma B — error al activar en PWA Android:** mensajes como «permiso concedido pero sin suscripción» + «No se pudo registrar el dispositivo».

**Verificación del Service Worker (producción):**

```bash
curl -sI https://TU-DOMINIO/onesignal/OneSignalSDKWorker.js
# Esperado: 200, Content-Type: application/javascript, Service-Worker-Allowed: /
curl -s https://TU-DOMINIO/onesignal/OneSignalSDKWorker.js
# Esperado: importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
```

Confirmado en `sales-app-nine-gamma.vercel.app` y `sales-saas-api.vercel.app`: el archivo existe y responde JS válido. Si en tu dominio custom falla, revisa rewrites de la SPA.

**Site URL en OneSignal (obligatorio):**

1. OneSignal → Settings → Push & In-App → Web Configuration.
2. **Site URL** debe coincidir **exactamente** con el dominio desde el que el usuario instaló la PWA (`https://…`, con/sin `www`, sin path).
3. Si tienes dos dominios Vercel, registra el que usan los usuarios finales (o ambos si OneSignal lo permite / usa el principal + redirects).

**Configuración en código:**

- `serviceWorkerPath`: `onesignal/OneSignalSDKWorker.js`
- `serviceWorkerParam.scope`: `/onesignal/` (dedicado; el SW de la PWA/Workbox usa `/`)
- Workbox excluye `/onesignal/` del `navigateFallback` y del precache
- Antes de `optIn`, la app hace preflight + `navigator.serviceWorker.register` del SW OneSignal

**Recuperación para usuarios ya afectados (Android PWA):**

1. Desplegar el fix.
2. En el teléfono: desinstalar la PWA (icono → desinstalar).
3. Chrome → candado / Información del sitio → **Borrar datos y cookies** del dominio de producción.
4. Abrir el dominio de producción en Chrome → Instalar app de nuevo.
5. Abrir desde el icono → Configuración → Notificaciones → **Activar notificaciones**.
6. OneSignal Audience: confirmar suscripción **Subscribed** + `external_id` = UUID Supabase.
7. Enviar prueba al `external_id` → Delivered ≥ 1.

**Causas frecuentes:**

1. **`external_id` no vinculado** — Aceptar el permiso del SO no equivale a `OneSignal.login(userId)`. La app vincula **después** de crear la suscripción, verifica `OneSignal.User.externalId`, reintenta en login/resume/visibilitychange y reporta fallos a Sentry (`VITE_SENTRY_DSN`).
2. **`subscription_id` no registrado en servidor** — Tras activar push, el cliente llama `POST /api/v1/notifications/device`. Si falló (red, sesión), el backend no tiene IDs para el fallback. El usuario puede desactivar y reactivar notificaciones en **Configuración → Notificaciones**.
3. **Filtro incorrecto en pruebas del dashboard** — En OneSignal, un envío a un `external_id` que no existe en Audience → Subscriptions muestra *No recipients*. Prueba con **Send to Test Users** usando el UUID de Supabase del usuario, o **All Subscribed Users** para descartar segmentación.
4. **Service Worker / PWA** — Conflicto con Workbox o SW “atascado” en el dispositivo. Ver recuperación arriba.
5. **Optimización de batería (Xiaomi, Huawei, Samsung, etc.)** — Puede matar el SW en segundo plano. Pedir al usuario: Ajustes → Apps → Chrome (o la PWA) → Batería → **Sin restricciones**.

**Verificación rápida (usuario autenticado):**

```bash
curl -b "cookies..." https://tu-dominio.com/api/v1/notifications/push-diagnostics
```

Respuesta esperada: `external_id` = UUID del usuario, `subscription_count` ≥ 1 si el dispositivo completó el registro.

**Prueba de entrega:**

1. OneSignal → **Audience → Subscriptions** → buscar por `external_id` (UUID Supabase) o por fecha/dispositivo Android.
2. Estado debe ser **Subscribed** (no Unsubscribed / Invalid).
3. Enviar mensaje de prueba a ese `external_id` → status **Delivered** con ≥ 1 destinatario.
4. Confirmar recepción visual en el Android (PWA instalada o pestaña con permiso concedido).

**PWA vs pestaña en Android:** Web Push funciona en Chrome con permiso concedido; la PWA instalada suele ser más estable para recibir en background. Tras reinstalar la PWA o limpiar datos del sitio, hay que volver a activar notificaciones.

## 4d. Sesión multi-dispositivo (logout global)

Ya tienes la migración **0025** (`auth_revoked_at`). El logout:

1. Emite Broadcast Realtime `SIGNED_OUT` en canal `user-session:{user_id}` (móvil ↔ desktop, simétrico)
2. Marca `profiles.auth_revoked_at`
3. Revoca refresh tokens (`signOut` global)
4. Avisa por OneSignal si la app está en background
5. La API rechaza JWT emitidos antes de `auth_revoked_at`

El cliente se suscribe en `initSessionSync()` (`apps/web/src/lib/session-cross-device.js`):
hidrata sesión browser (cookies → `setSession`), escucha Broadcast + `postgres_changes`, y se desuscribe al logout.

### Ajuste recomendado en Supabase Dashboard (JWT corto)

El access token de Supabase **no se invalida** hasta `exp`. Acorta la ventana residual:

1. Abre [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto  
2. **Authentication → Settings** (o **Configuration → Auth**)  
3. **JWT expiry** → `900` (15 minutos)  
4. Guarda

Con 15 min + `auth_revoked_at`, aunque falle Realtime/push, el token viejo deja de servir pronto. No uses valores extremos (&lt; 5 min) en móvil: más refrescos y más fallos con red inestable.

| Capa | Qué cubre |
|------|-----------|
| `auth_revoked_at` + API | Seguridad real |
| Broadcast `user-session:{id}` | Tiempo real móvil ↔ desktop |
| Realtime postgres_changes | Respaldo del Broadcast + invalidación Dashboard |
| Push `session_revoked` | PWA en background |
| JWT 15 min | Tope de exposición residual |

### Dashboard en tiempo real (migración 0026)

Tras login, el cliente escucha `prospects` / `sales` / `goals` / `calendar_entries`
(filtrado por `user_id`). Cada cambio dispara un pull debounced y el Dashboard
recalcula con `productionTourSaleCounts` / `getDashboardWeeks` (sin contadores +1).

Aplica `0026_realtime_dashboard_tables.sql` en Supabase si aún no está en la publicación Realtime.

## 5. Siguientes pasos (los implemento yo con las credenciales)

- Páginas de login/registro + `/auth/callback` + middleware de sesión.
- Capa de datos con Server Actions que reemplaza `localStorage`
  manteniendo las firmas actuales de `db-store`.
- Importación del respaldo local (`sts4_v1`) al primer inicio de sesión.

## Modelo de datos

`profiles`, `prospects`, `sales`, `calendar_entries`, `goals`, `activities`,
`tool_calculations`. Todo con **RLS per-vendedor** (`auth.uid() = user_id`).
Los datos de calculadoras se guardan como `jsonb` en `tool_calculations.data`.
