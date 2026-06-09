# Migración Next.js → React (Vite) + Express API

## Estructura del monorepo

```
sales-app/
├── apps/
│   ├── api/          # Express REST (@salesapp/api) — puerto 4000
│   └── web/          # React SPA Vite (@salesapp/web) — puerto 5173
├── packages/
│   └── shared/       # Lógica compartida JS (sync, mappers, validators)
└── supabase/         # Migraciones Postgres
```

## Comandos

```bash
# API Express
npm run dev:api

# Frontend Vite (proxy /api → :4000)
npm run dev:web

# Build producción SPA
npm run build:web

# Arranque producción (API + preview estático)
npm run start:prod

# Verificar API + SPA
npm run verify:api
npm run verify

# Sincronizar shared desde apps/web/src/lib
npm run sync:shared
```

## Variables de entorno

| Variable | API | Web (Vite) |
|----------|-----|------------|
| `SUPABASE_URL` | ✓ | — |
| `SUPABASE_ANON_KEY` | ✓ | — |
| `VITE_SUPABASE_URL` | — | ✓ |
| `VITE_SUPABASE_ANON_KEY` | — | ✓ |
| `NEXT_PUBLIC_SUPABASE_*` | ✓ (fallback) | ✓ (fallback) |
| `API_PORT` | ✓ (default 4000) | — |
| `WEB_ORIGIN` | ✓ (CORS) | — |
| `FRANKFURTER_API_URL` | ✓ (opcional) | — |

## Fases

| Fase | Estado | Descripción |
|------|--------|-------------|
| 0 | ✅ | Monorepo npm workspaces, `packages/shared` |
| 1 | ✅ | API Express `/api/v1/*` + `/auth/*` |
| 2 | ✅ | SPA Vite con React Router, UI portada |
| 3 | ✅ | Auth completa + admin CSR vía API |
| 4 | ✅ | Sync web vía `PUT/GET /api/v1/sync` |
| 5 | ✅ | PWA, lib/stores en `apps/web`, Next.js retirado |

## APIs de configuración

| API | Endpoint |
|-----|----------|
| Exchange Rate | `GET /api/v1/exchange-rates?to=MXN` |
| User Settings | `GET/PATCH /api/v1/profile` |
| Geo catálogo | `GET /api/v1/geo/countries`, `GET /api/v1/geo/countries/:país/cities` |
| Recordatorios | `GET /api/v1/reminders?from=&to=` |

## Arquitectura (¿MVC?)

**No es MVC clásico** (Model–View–Controller con capas 1:1 como Laravel/Rails). Es un **monorepo modular** con dos aplicaciones y dominio compartido:

| Capa | Frontend (`apps/web`) | Backend (`apps/api`) |
|------|----------------------|----------------------|
| **Vista** | Componentes React (`.jsx`) + rutas React Router | No hay vista (solo JSON) |
| **Estado / modelo de UI** | Zustand (`stores/`) + `localStorage` | — |
| **Dominio** | `lib/calculations`, `lib/storage`, `lib/clients` | `packages/shared` (sync, mappers, validators) |
| **Control / orquestación** | Hooks, providers (`SyncProvider`), handlers en componentes | **Routes** (`routes/v1`, `admin`, `auth`) + **middleware** |
| **Datos remotos** | `fetch` → `/api/v1/*` (sin Supabase en browser) | Supabase Postgres + RLS (capa de persistencia) |
| **Servicios** | `session-api`, `sync-api` | `lib/admin/data`, `exchange-rates`, `geo-catalog`, `reminders` |

Patrón real: **SPA + API REST en capas** (Route → Middleware → Service → Supabase). En el cliente, **actions/hooks → Zustand store → componentes**.

```
apps/api/src/
  routes/        # Controladores HTTP (delgados)
  services/      # Lógica de negocio por dominio
  middleware/    # Auth, admin
  lib/           # Infra (http, admin queries)

apps/web/src/
  components/    # Vista
  actions/       # Mutaciones de negocio (llaman al store)
  hooks/         # Puente React → actions
  stores/        # Estado de UI + modelo local
  lib/           # Dominio compartido en cliente
```

## Deploy en Vercel

1. Conectar el repo en [vercel.com](https://vercel.com) (raíz del proyecto: `sales-app`).
2. `vercel.json` ya define build del SPA + función serverless Express en `api/index.mjs`.
3. Variables de entorno en Vercel (Production):

| Variable | Valor |
|----------|--------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | Anon key |
| `WEB_ORIGIN` | `https://tu-dominio.vercel.app` |
| `VITE_SUPABASE_URL` | Igual que `SUPABASE_URL` (build del SPA) |
| `VITE_SUPABASE_ANON_KEY` | Igual que anon key |

4. En Supabase → Authentication → URL Configuration, añadir la URL de Vercel como **Site URL** y redirect `https://tu-dominio.vercel.app/auth/callback`.

```bash
# Preview local del build (sin Vercel)
npm run build:web && npm run preview
```

## Tests E2E

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

## Notas técnicas

- La web **no usa** cliente Supabase en el navegador; sesión vía cookies + `/api/v1/auth/session`.
- `apps/web/src/lib` y `apps/web/src/stores` son la fuente de verdad del frontend.
- i18n básico ES/EN en `apps/web/src/lib/i18n.js`.
- Producción Vercel: SPA estático + misma función para `/api/*`, `/auth/*` y `/health`.
