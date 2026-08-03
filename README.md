# Saletse (SalesSaas)

Plataforma de ventas para timeshare y clubes vacacionales: agenda, expedientes, calculadoras, metas y workspaces personal/sala.

Stack: monorepo npm — **Vite + React** (`apps/web`), **Express** (`apps/api`), **Supabase**, deploy en **Vercel**.

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
| `WEB_ORIGIN` | Origen del front (`http://localhost:5173` o `https://saletse.vercel.app`) |
| `API_PORT` | Puerto API local |
| `ONESIGNAL_APP_ID` / `VITE_ONESIGNAL_APP_ID` | Push |
| `ONESIGNAL_REST_API_KEY` | Push servidor |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `SUPPORT_EMAIL` | Email soporte |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Observabilidad (opcional) |
| `CRON_SECRET` | Cron Vercel |
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
apps/web/       Frontend Vite + React
apps/api/       API Express
packages/shared Código compartido
supabase/       Migraciones y notas Auth
public/         Assets estáticos (Vite publicDir)
docs/           Documentación técnica versionada
scripts/        Utilidades (seed, migrate, verify)
e2e/            Playwright
```

## Documentación relacionada

- `MIGRATION.md` — notas de migración
- `supabase/README.md` — Auth, Redirect URLs, Realtime
- `docs/RBAC-ADDITIVE.md` — permisos aditivos (rol ∪ overrides); aplicar migración `0063`
- `docs/` — arquitectura y performance
- `apps/api/API.md` — API

## Licencia

Privado (`private: true` en package.json).
