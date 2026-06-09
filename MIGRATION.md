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

## Notas técnicas

- La web **no usa** cliente Supabase en el navegador; sesión vía cookies + `/api/v1/auth/session`.
- `apps/web/src/lib` y `apps/web/src/stores` son la fuente de verdad del frontend.
- i18n básico ES/EN en `apps/web/src/lib/i18n.js`.
- Deploy: build del SPA + servir `dist` detrás de proxy reverso hacia API.
