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

> La tabla `push_subscriptions` (migración 0020) ya no se usa; OneSignal gestiona los dispositivos vinculados por `external_id` (UUID de Supabase).

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
| Realtime postgres_changes | Respaldo del Broadcast |
| Push `session_revoked` | PWA en background |
| JWT 15 min | Tope de exposición residual |

## 5. Siguientes pasos (los implemento yo con las credenciales)

- Páginas de login/registro + `/auth/callback` + middleware de sesión.
- Capa de datos con Server Actions que reemplaza `localStorage`
  manteniendo las firmas actuales de `db-store`.
- Importación del respaldo local (`sts4_v1`) al primer inicio de sesión.

## Modelo de datos

`profiles`, `prospects`, `sales`, `calendar_entries`, `goals`, `activities`,
`tool_calculations`. Todo con **RLS per-vendedor** (`auth.uid() = user_id`).
Los datos de calculadoras se guardan como `jsonb` en `tool_calculations.data`.
