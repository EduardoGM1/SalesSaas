# Salètse — Información técnica del sistema

Documento de referencia general: tecnologías, arquitectura, estructura del monorepo, modelo de datos y relaciones principales.

> Producto: plataforma SaaS de ventas para timeshare / clubes vacacionales (agenda, expedientes, herramientas comerciales, metas, red, workspaces personal/sala).  
> Repositorio: monorepo `sales-app` (npm workspaces).  
> Producción típica: [saletse.vercel.app](https://saletse.vercel.app).

---

## 1. Resumen ejecutivo

| Aspecto | Detalle |
|--------|---------|
| Tipo | SaaS multi-workspace (empresa → sala de ventas → datos operativos) |
| Frontend | Vite + React 19 + React Router 7 |
| Backend | Express (Node.js, JavaScript) |
| Datos / Auth | Supabase (PostgreSQL + Auth + Realtime + Storage + RLS) |
| Estado cliente | Zustand + persistencia local (offline-first) + sync a nube |
| Deploy | Vercel (web + API serverless/Node) |
| Idiomas UI | ES / EN (catálogos i18n) |

---

## 2. Stack tecnológico

### 2.1 Frontend (`apps/web`)

| Tecnología | Uso |
|------------|-----|
| Vite 6 | Build y dev server |
| React 19 | UI |
| React Router DOM 7 | Routing SPA |
| Zustand | Estado global (DB local, sync, app) |
| Tailwind CSS 3 | Estilos utilitarios |
| Lucide React | Iconografía |
| Recharts | Gráficas (metas / métricas) |
| @dnd-kit | Drag & drop |
| vite-plugin-pwa | PWA / service worker |
| Sentry (browser) | Observabilidad (opcional) |
| OneSignal | Push notifications (cliente) |

### 2.2 Backend (`apps/api`)

| Tecnología | Uso |
|------------|-----|
| Express 4 | HTTP API |
| Node.js (ESM) | Runtime |
| @supabase/supabase-js / ssr | Cliente Supabase (anon + service role) |
| cookie-parser, cors, compression | Infra HTTP |
| Resend | Email (soporte) |
| dotenv | Variables de entorno |

**Estilo de arquitectura API:** *thin router + fat service* (rutas en `routes/`, lógica en `services/`, sin capa Controllers formal todavía).

### 2.3 Datos e infraestructura

| Tecnología | Uso |
|------------|-----|
| PostgreSQL (Supabase) | Base de datos principal |
| Supabase Auth | Login, JWT, sesión |
| Supabase Realtime | Presencia, chat, sync reactivo |
| Supabase Storage | Logos, adjuntos soporte, archivos de expediente |
| Row Level Security (RLS) | Aislamiento por workspace / permisos |
| Migraciones SQL | `supabase/migrations/` (0001 → 0066+) |

### 2.4 Calidad y tooling

| Herramienta | Uso |
|-------------|-----|
| Playwright | E2E |
| Scripts `verify*` | Smoke tests API / flags / workspaces |
| TypeScript (dev) | Tipado parcial en shared / algunos módulos web |
| npm workspaces | Monorepo |

### 2.5 Integraciones externas

- **OneSignal** — push
- **Resend** — correo de soporte
- **Sentry** — errores (opcional)
- **Vercel Cron** — jobs programados (`CRON_SECRET`)

---

## 3. Estructura del monorepo

```
sales-app/
├── apps/
│   ├── web/                 # SPA Vite + React
│   │   └── src/
│   │       ├── components/  # UI por dominio (clients, calculators, admin…)
│   │       ├── pages/       # Páginas de ruta
│   │       ├── layouts/     # DashboardLayout, AuthLayout, AdminSection
│   │       ├── hooks/       # useFlag, useAppNav, useToolSession…
│   │       ├── stores/      # Zustand (db-store, sync-store…)
│   │       ├── lib/         # Utilidades, i18n, auth, sync, currency…
│   │       ├── routes/      # Árbol React Router
│   │       └── styles/      # CSS / overrides
│   └── api/                 # Express
│       └── src/
│           ├── routes/      # v1.js, admin.js, auth.js
│           ├── services/    # Dominio (prospects, sales, flags, tenant…)
│           ├── middleware/  # auth, admin-auth, rate-limit
│           └── lib/         # supabase, workspace-scope, http helpers
├── packages/
│   └── shared/              # Auth catalog, validators, mappers, sync types
├── supabase/
│   ├── migrations/          # Schema versionado
│   └── README.md            # Auth / Redirect URLs
├── docs/                    # Documentación técnica
├── scripts/                 # Seed, migrate, verify, diagnose
├── e2e/                     # Playwright
└── public/                  # Assets estáticos (Vite publicDir)
```

### Comandos habituales

```bash
npm install
npm run dev:api          # API ~:4000
npm run dev:web          # Web ~:5173 (proxy /api, /auth)
npm run build            # Build web → apps/web/dist
npm run start:prod       # Sirve build + API
npm run verify           # Smoke
npm run test:e2e         # Playwright
```

---

## 4. Arquitectura lógica

```
┌─────────────┐     HTTPS      ┌──────────────┐
│  Browser    │───────────────▶│  Vite SPA    │
│  (PWA)      │◀───────────────│  apps/web    │
└─────────────┘   JSON/JWT     └──────┬───────┘
                                      │ /api/v1, /auth
                                      ▼
                               ┌──────────────┐
                               │  Express API │
                               │  apps/api    │
                               └──────┬───────┘
                                      │ service role / user JWT
                                      ▼
                               ┌──────────────┐
                               │  Supabase    │
                               │  PG + Auth   │
                               │  Realtime    │
                               │  Storage     │
                               └──────────────┘
```

### Capas de responsabilidad

| Capa | Responsabilidad |
|------|-----------------|
| UI | Captura, calculadoras, listados, admin |
| Store local | Caché offline (clientes, tools) + dirty sync |
| API | Autorización, validación, operaciones sensibles |
| PostgreSQL + RLS | Persistencia e aislamiento |
| Shared | Catálogo de permisos, validadores, mappers |

### Frontera de datos (multi-workspace)

```
Sistema (global)
 └── Empresa (tenant comercial)
      └── Sala de ventas (workspace tipo sala_de_venta)
           └── Expedientes, ventas, agenda, tools…
 └── Workspace personal (por usuario)
      └── Expedientes propios (pueden transferirse a sala)
```

- **`user_id`**: actor / creador.
- **`workspace_id`**: frontera de aislamiento operativo (RLS + API).
- La empresa se obtiene vía `workspaces.empresa_id` (las tablas CRM no llevan `empresa_id` denormalizado).

---

## 5. Autenticación y autorización

### 5.1 Autenticación

1. Usuario inicia sesión con **Supabase Auth**.
2. Se crea/actualiza fila en `profiles` (trigger `handle_new_user`).
3. Se asegura un **workspace personal**.
4. La sesión API valida JWT (cookie o `Authorization: Bearer`).
5. `profiles.workspace_activo_id` define el contexto activo (personal o sala).

### 5.2 Autorización (capas)

| Capa | Qué controla |
|------|----------------|
| Rol de plataforma | `profiles.role` / `role_id` → Superadmin, Admin, Vendedor, Soporte |
| Membresía de empresa | `empresa_miembros` → Admin de empresa |
| Membresía de sala | `workspace_miembros` + `role_id` (Gerente, Vendedor, Liner, Cerrador…) |
| Permisos (`permission_keys`) | Catálogo `permisos` + `rol_permisos` + overrides aditivos |
| Feature flags | `flags` / `flag_reglas` / paquetes (`paquete_flags`) → módulos UI |
| Plan / membresía | `planes` + `membresias` (basico / pro) por usuario |

**Precedencia de flags:** usuario → rol → membresía (plan) → default global.  
Si el flag padre está off, los hijos quedan off.

**Overrides de permisos:** modelo aditivo (unión rol ∪ overrides con `otorgado=true`). Ver `docs/RBAC-ADDITIVE.md`.

### 5.3 Roles típicos

| Rol | Ámbito | Notas |
|-----|--------|-------|
| Superadmin | Plataforma | Configuración global; sin lectura CRM fila a fila |
| Admin | Plataforma | Panel de sistema |
| Soporte | Plataforma | Tickets de ayuda |
| Vendedor | Plataforma (+ copia tenant) | Default histórico / personal |
| Gerente | Sala (tenant) | Equipo, asignación |
| Liner | Sala (tenant) | Survey + Proyección (por paquete) |
| Cerrador | Sala (tenant) | Módulos completos + cierre |
| Admin empresa | `empresa_miembros.es_admin` | Gestión de salas / puestos / branding |

---

## 6. Módulos funcionales (producto)

| Módulo | Descripción | Persistencia principal |
|--------|-------------|------------------------|
| Agenda | Calendario de citas / seguimiento | `calendar_entries` |
| Clientes / Expedientes | CRM del prospecto | `prospects` + relacionados |
| Survey | Discovery / motivaciones / timeshare / gastos | `tool_calculations` (tool=survey) |
| Proyección de Vacaciones | Calculadora vacacional | `tool_calculations` |
| Worksheet | Hoja financiera | `tool_calculations` |
| Money Box | Escenarios (submódulo Worksheet) | Derivado + flag `worksheet.money_box` |
| Analysis | Análisis auxiliar | `tool_calculations` / flags |
| Ventas | Registro de ventas | `sales` |
| Metas / Dashboard | Objetivos y métricas | `goals` + agregados |
| Red / Mensajes | Contactos y chat | network + messages |
| Mi equipo | Miembros de sala | `workspace_miembros` |
| Admin | Panel sistema / empresa | rutas `/admin` |
| Soporte | Tickets | `support_requests` |

Herramientas en expediente:  
`/clients/:id/{survey|vacaciones|worksheet|money-box|analysis}`  
Modo libre: `/tools/...` (sin expediente).

---

## 7. Base de datos — modelo relacional

### 7.1 Diagrama conceptual (núcleo)

```
auth.users 1──1 profiles
                 │
                 ├── workspace_activo_id ──▶ workspaces
                 │                              │
                 │                              ├── tipo: personal | sala_de_venta
                 │                              ├── empresa_id ──▶ empresas (solo salas)
                 │                              │
                 │                              ├──◀── workspace_miembros ──▶ profiles
                 │                              │         (+ role_id ──▶ roles)
                 │                              │
                 │                              ├──◀── prospects (workspace_id)
                 │                              ├──◀── sales
                 │                              ├──◀── activities
                 │                              ├──◀── calendar_entries
                 │                              └──◀── tool_calculations
                 │
empresas ◀── empresa_miembros ──▶ profiles
    │
    ├── paquetes_acceso ── paquete_flags ──▶ flags
    └── roles (scope empresa|workspace, empresa_id)

roles (plataforma: empresa_id NULL)
  └── rol_permisos ──▶ permisos

flags ── flag_reglas (alcance: rol | usuario | membresia)
planes ── membresias ──▶ profiles

prospects ── prospect_workflows (participantes: rep / gerente / cerrador)
          ── prospect_shares
          ── tool_calculations
          ── sales (opcional)
```

### 7.2 Entidades principales

#### Identidad y acceso

| Tabla | Descripción | Claves / FKs |
|-------|-------------|--------------|
| `auth.users` | Usuario Supabase Auth | PK `id` |
| `profiles` | Perfil app | PK = `auth.users.id`; FK `role_id`, `workspace_activo_id` |
| `roles` | Roles plataforma o tenant | PK `id`; `empresa_id` NULL = plataforma |
| `permisos` | Catálogo de permisos | PK `id`; `clave` UNIQUE |
| `rol_permisos` | Permisos por rol | FK `rol_id`, `permiso_id` |
| `usuario_permisos_override` | Overrides aditivos por usuario | FK usuario, permiso |

#### Organización multi-workspace

| Tabla | Descripción | Claves / FKs |
|-------|-------------|--------------|
| `empresas` | Tenant comercial | PK `id` |
| `workspaces` | Personal o sala | PK `id`; FK `empresa_id` (salas) |
| `workspace_miembros` | Miembro de sala/personal | UNIQUE (`usuario_id`,`workspace_id`); FK `role_id` |
| `empresa_miembros` | Admin / miembro de empresa | UNIQUE (`empresa_id`,`usuario_id`) |
| `paquetes_acceso` | Paquete de módulos por empresa | FK `empresa_id` |
| `paquete_flags` | Flags activos del paquete | FK `paquete_id`, `flag_id` |

#### CRM operativo

| Tabla | Descripción | Claves / FKs |
|-------|-------------|--------------|
| `prospects` | Expediente | PK `id`; FK `user_id`, `workspace_id` **NOT NULL** |
| `prospect_workflows` | Participantes comerciales | FK `prospect_id`; rep / gerente / cerrador |
| `prospect_workflow_events` | Historial de eventos workflow | FK prospect |
| `prospect_shares` | Compartidos con contactos de red | FK prospect, usuarios |
| `sales` | Ventas | FK `user_id`, `workspace_id`, opcional `prospect_id` |
| `activities` | Actividades | FK workspace / user |
| `calendar_entries` | Agenda | FK `workspace_id`, `user_id` |
| `goals` | Metas | FK user / workspace |
| `tool_calculations` | Snapshot JSON por herramienta | UNIQUE (`user_id`,`prospect_id`,`tool`) |

#### Módulos y monetización

| Tabla | Descripción |
|-------|-------------|
| `flags` | Catálogo de módulos / sub-flags (árbol `flag_padre`) |
| `flag_reglas` | Excepciones por rol, usuario o membresía (plan) |
| `planes` | Planes `basico` / `pro` |
| `membresias` | Suscripción del usuario a un plan |
| `funciones_premium` | Catálogo legacy de features premium |

#### Colaboración y plataforma

| Tabla | Descripción |
|-------|-------------|
| Mensajes / red | Contactos, chats, presencia (`user_presence`, etc.) |
| `support_requests` | Tickets de soporte |
| Logs admin | Auditoría de acciones de panel |
| Push | Suscripciones / jobs programados |

### 7.3 Relaciones críticas (reglas de negocio en datos)

| Regla | Cómo se expresa |
|-------|-----------------|
| Una sala pertenece a una empresa | `workspaces.empresa_id` en `tipo = sala_de_venta` |
| Un expediente pertenece a un workspace | `prospects.workspace_id NOT NULL` |
| Un usuario puede tener varios workspaces | `workspace_miembros` (producto: 1 sala a la vez + personal) |
| Transfer personal → sala | RPC `transfer_prospect_to_sala` (mueve el mismo `prospect.id`) |
| No cruzar empresas al compartir | `assertWorkspaceBoundary` / `workspace_boundary_ok` |
| Un solo gerente por sala | Índice único parcial sobre `rol_en_workspace = 'gerente'` |
| Roles plataforma vs tenant | `roles.empresa_id IS NULL` vs NOT NULL |

### 7.4 Seguridad a nivel BD

- **RLS** habilitado en tablas sensibles.
- Helpers típicos: `user_in_workspace`, `workspace_has_permission`, `user_in_empresa`, `is_super_admin`.
- Operaciones privilegiadas usan **service role** en API tras validar al actor.
- Superadmin / Admin de plataforma: agregados y configuración; **sin** lectura CRM global fila a fila (política de privacidad).

### 7.5 Migraciones

Las migraciones viven en `supabase/migrations/` numeradas (`0001_…` … `0066_…`).  
Temas relevantes por bloque:

| Rango | Temas |
|-------|--------|
| 0001–0010 | Schema inicial CRM, admin, features |
| 0011–0021 | Sharing, red, presencia, push, tipo tour |
| 0022–0036 | Privacidad admin, soporte, sales status |
| 0037–0042 | Membresías, roles/permisos, logs, soporte |
| 0043–0051 | Survey config, feature flags |
| 0052–0056 | Multi-workspace, tenant RBAC, workflow, backfill |
| 0057–0064 | Transfer, participantes, RLS, limpieza pipeline |
| 0065–0066 | Flags membresía, Liner, listado roles plataforma |

---

## 8. API REST

Base: **`/api/v1`**  
Auth: cookie de sesión o `Authorization: Bearer <access_token>`.

### Convenciones

- Éxito: `{ "data": ... }`
- Error: `{ "error": "mensaje" }`
- Índice vivo: `GET /api/v1/`

### Módulos de endpoints (resumen)

| Dominio | Prefijo / recursos |
|---------|-------------------|
| Sesión | `/auth/session`, perfil |
| Expedientes | `/prospects` |
| Ventas | `/sales` |
| Agenda | `/calendar-entries` |
| Metas | `/goals` |
| Actividades | `/activities` |
| Herramientas | `/tool-calculations` |
| Survey config | `/survey/questions-config` |
| Sync | `/sync` |
| Red / mensajes | `/network/*`, `/messages/*` |
| Notificaciones | `/notifications/*` |
| Workspace | invite, switch, team |
| Admin plataforma | `/admin/*` |
| Admin tenant | `/admin/tenant/empresas/...` |

Detalle: `apps/api/API.md`.

---

## 9. Frontend — navegación principal

| Ruta | Módulo |
|------|--------|
| `/` | Agenda |
| `/clients`, `/clients/:id` | Expedientes |
| `/clients/:id/survey` (etc.) | Herramientas en expediente |
| `/tools` | Hub de herramientas (modo libre) |
| `/sales` | Historial de ventas |
| `/metas`, `/goals` | Metas / dashboard |
| `/network`, `/messages` | Red y chat |
| `/team` | Mi equipo (gerente) |
| `/admin/*` | Panel de administración (embebido en el shell) |

Layouts:

- `AuthLayout` — login / registro  
- `DashboardLayout` — app principal (sidebar + workspace rail)  
- `AdminSection` — panel admin dentro del mismo shell SPA  

---

## 10. Flujos de datos destacados

### 10.1 Offline → nube

1. UI escribe en store local (Zustand / IndexedDB-like).  
2. Sync periódica / al volver online hacia `/api/v1/sync`.  
3. Tablas remotas + Realtime refrescan otras sesiones.

### 10.2 Expediente en sala

1. Alta de `prospects` con `workspace_id` de la sala.  
2. Upsert de `prospect_workflows` (representante, gerente; cerrador opcional).  
3. Tools se guardan en `tool_calculations` ligadas a `prospect_id`.  
4. Venta se registra en `sales` (mismo workspace).

### 10.3 Transfer personal → sala

RPC `transfer_prospect_to_sala`: mueve el expediente y datos hijos al workspace sala; reasigna participantes (representante = actor, cerrador limpio).

---

## 11. Variables de entorno (nombres)

| Variable | Ámbito |
|----------|--------|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | URL proyecto |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | Cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor |
| `WEB_ORIGIN` | CORS / cookies |
| `API_PORT` | Puerto API local |
| `ONESIGNAL_*` | Push |
| `RESEND_*` / `SUPPORT_EMAIL` | Email |
| `SENTRY_*` | Observabilidad |
| `CRON_SECRET` | Cron Vercel |
| `DATABASE_URL` | Migraciones / scripts |

Plantilla: `.env.example` (nunca versionar `.env` / `.env.local`).

---

## 12. Documentación relacionada

| Archivo | Contenido |
|---------|-----------|
| `README.md` | Setup rápido |
| `apps/api/API.md` | Endpoints REST |
| `supabase/README.md` | Auth, Redirect URLs, Realtime |
| `docs/RBAC-ADDITIVE.md` | Modelo de permisos aditivos |
| `MIGRATION.md` | Notas de migración |
| `docs/` | Arquitectura, performance, etc. |

---

## 13. Glosario

| Término | Significado en Salètse |
|---------|------------------------|
| Empresa | Tenant comercial (`empresas`) |
| Sala / Workspace sala | Unidad operativa de ventas (`workspaces.tipo = sala_de_venta`) |
| Personal | Workspace individual del usuario |
| Expediente / Prospect / Cliente (UI) | Caso comercial (`prospects`) |
| Tool / Herramienta | Survey, Vacaciones, Worksheet, Money Box, Analysis |
| Liner | Rol de apertura (Survey + Proyección) |
| Cerrador | Rol de cierre (módulos completos) |
| Flag | Feature flag de módulo |
| Paquete | Conjunto de flags ligado a un puesto de sala |

---

*Documento generado como referencia técnica general del sistema. Actualizar cuando cambien migraciones mayores o el stack.*
