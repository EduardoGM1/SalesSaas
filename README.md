# Saletse (SalesSaas)

Plataforma de ventas para timeshare y clubes vacacionales: agenda, expedientes, calculadoras, metas y workspaces personal/sala.

Stack: monorepo npm — **Vite + React** (`apps/web`), **Express** (`apps/api`), **Supabase** autoalojado. Producción: Nginx + PM2 en VPS (detalle en [`docs/PROYECTO.md`](docs/PROYECTO.md) y [`docs/arquitectura/entornos.md`](docs/arquitectura/entornos.md)). El repo aún conserva artefactos históricos de Vercel (`vercel.json`, `api/index.mjs`); no son el camino de deploy actual.

## Requisitos

- Node.js 20+
- Cuenta Supabase (proyecto con migraciones aplicadas)
- Opcional: OneSignal, Resend, Sentry

## Instalación

```bash
git clone <url-del-repo>
cd sales-app
cp .env.example .env.local
npm install
```

Completa `.env.local` con los nombres de variables de `.env.example` (nunca subas ese archivo).

## Desarrollo

```bash
# API (puerto 4000 por defecto)
npm run dev:api

# Web (Vite, http://localhost:5173 — proxy /api y /auth a la API)
npm run dev:web

# Solo web (atajo)
npm run dev
```

## Build / producción local

```bash
npm run build          # web → apps/web/dist
npm run start:prod     # sirve build + API (ver scripts/start-prod.mjs)
```

## Variables de entorno (nombres)

| Variable | Uso |
|----------|-----|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor — nunca en el cliente |
| `WEB_ORIGIN` | Origen del front (`http://localhost:5173` o el origen público del VPS) |
| `API_PORT` | Puerto API local |
| `ONESIGNAL_APP_ID` / `VITE_ONESIGNAL_APP_ID` | Push |
| `ONESIGNAL_REST_API_KEY` | Push servidor |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `SUPPORT_EMAIL` | Email soporte |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Observabilidad (opcional) |
| `CRON_SECRET` | Auth de crons (flush de recordatorios, etc.) |
| `DATABASE_URL` | Migraciones / CLI Supabase |

Detalle de Auth/URL: `supabase/README.md`.

## Pruebas

```bash
npm run verify           # smoke general
npm run verify:api       # smoke API
npm run test:e2e         # Playwright
npm run test:money-box   # unit Money Box
```

## Estructura

```
apps/web/       Frontend Vite + React (`modulos/` + legacy congelado)
apps/api/       API Express (JS) — `modulos/` + shims legacy
packages/shared Código compartido
supabase/       Migraciones
public/         Assets estáticos (Vite publicDir)
docs/           Fuente de verdad: [`docs/PROYECTO.md`](docs/PROYECTO.md)
scripts/        Deploy, seed, migrate, verify, QA
e2e/            Playwright
```

## Documentación

- **[`docs/PROYECTO.md`](docs/PROYECTO.md)** — documento maestro (stack, módulos, deuda, ops)
- [`docs/ROLES-Y-PERMISOS.md`](docs/ROLES-Y-PERMISOS.md) — roles, flags vs permisos, menú
- `apps/api/API.md` — endpoints REST
- `supabase/README.md` — Auth, Redirect URLs, Realtime, migraciones

```bash
# Aplicar una migración SQL (requiere DATABASE_URL)
npm run db:migrate -- 0075
```

## Licencia

Privado (`private: true` en package.json).
