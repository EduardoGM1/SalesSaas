# Migración Next.js → React (Vite) + Express API

## Estructura del monorepo

```
sales-app/
├── apps/
│   ├── api/          # Express REST (@salesapp/api) — puerto 4000
│   └── web/          # React SPA Vite (@salesapp/web) — puerto 5173
├── packages/
│   └── shared/       # Lógica compartida JS (sync, mappers, validators)
├── src/              # Legacy Next.js (se retirará en fase 5)
└── supabase/         # Migraciones Postgres (sin cambios)
```

## Comandos

```bash
# API Express
npm run dev:api

# Frontend Vite (proxy /api → :4000)
npm run dev:web

# Legacy Next.js (convivencia temporal)
npm run dev:legacy

# Verificar API
npm run verify:api

# Sincronizar shared desde src/lib
npm run sync:shared

# Portar componentes UI legacy → web
node scripts/port-web.mjs && node scripts/fix-web-imports.mjs
```

## Variables de entorno

| Variable | API | Web (Vite) | Next (legacy) |
|----------|-----|------------|---------------|
| `SUPABASE_URL` | ✓ | — | — |
| `SUPABASE_ANON_KEY` | ✓ | — | — |
| `VITE_SUPABASE_URL` | — | ✓ | — |
| `VITE_SUPABASE_ANON_KEY` | — | ✓ | — |
| `NEXT_PUBLIC_SUPABASE_*` | ✓ (fallback) | — | ✓ |
| `API_PORT` | ✓ (default 4000) | — | — |
| `WEB_ORIGIN` | ✓ (CORS, default http://localhost:5173) | — | — |

## Fases

| Fase | Estado | Descripción |
|------|--------|-------------|
| 0 | ✅ | Monorepo npm workspaces, `packages/shared` |
| 1 | ✅ | API Express `/api/v1/*` + `/auth/*` |
| 2 | ✅ | SPA Vite con React Router, UI portada |
| 3 | ✅ | Auth completa (login/register/forgot/reset) + admin CSR vía `/api/v1/admin/*` |
| 4 | ✅ | Sync web vía `PUT/GET /api/v1/sync` |
| 5 | 🟡 | PWA vite-plugin-pwa activo; retirar Next.js y purgar alias legacy pendiente |

## Notas técnicas

- El web reutiliza temporalmente `src/lib` y `src/stores` del legacy vía alias Vite.
- `apps/web` compila con esbuild `tsx` loader (sintaxis TS residual en `.jsx`).
- La API usa `@supabase/supabase-js` + RLS (no ORM Drizzle aún; planificado).
