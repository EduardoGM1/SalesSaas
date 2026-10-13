# Baseline Fase 1 — red de seguridad (funcional)

**Fecha (UTC):** 2026-10-13T10:17:35Z  
**SHA:** `1ddba498af2a243e16faca4a14859cb7c7c9a128`  
**Rama:** `main` (`main` == `origin/main`)  
**Deploy:** no  
**Piloto:** autorizado módulo 1 (geo + exchange-rates) en rama aparte; sin merge hasta OK

---

## Supabase del stack local (baseline)

| Pregunta | Respuesta |
|----------|-----------|
| **Tipo** | **Producción** (proyecto cloud hospedado en Supabase; hostname sin marcador staging/qa/local) |
| **¿Local / staging?** | No. No había instancia Supabase local ni URL de staging. |

### ¿verify / e2e escribieron algo?

**No.** Solo lecturas:

| Suite | Métodos | Efecto en Supabase |
|-------|---------|-------------------|
| `npm run verify` | `GET` `/health`, `/api/v1`, `/api/v1/geo/countries`, `/api/v1/profile`, `/api/v1/reminders`, `GET` SPA `/` | Geo es catálogo estático en proceso (sin BD). Profile/reminders → **401** (sin sesión). Ningún `POST`/`PUT`/`PATCH`/`DELETE`. |
| e2e smoke | Navegación a `/login`, `/register`, `/settings` + `GET` `/api/v1` y `/api/v1/geo/countries` vía proxy | Sin login, sin registro, sin formularios enviados, sin mutaciones. |

---

## Reproducibilidad — stack local

### Comandos

```bash
# Terminal A — API
npm run dev:api

# Terminal B — Web (Vite)
npm run dev:web

# Verificar (hostname localhost; no 127.0.0.1 en Windows — Vite puede escuchar solo en ::1)
API_BASE=http://localhost:4000 WEB_BASE=http://localhost:5173 npm run verify

# Suite funcional
npm run test:web
npx playwright test e2e/smoke.spec.js
# o todo junto (exige stack arriba):
npm run verificar:arquitectura:completo
```

### Variables necesarias (solo nombres; valores en `.env.local`, nunca en el repo)

| Ámbito | Variables |
|--------|-----------|
| API | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (si el smoke/API lo requiere), `API_PORT` (default 4000), `WEB_ORIGIN` |
| Web (Vite) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Verify | `API_BASE`, `WEB_BASE` (default `http://localhost:4000` / `http://localhost:5173`) |
| Opcionales | `SUPABASE_PUBLIC_URL`, `ONESIGNAL_*`, `VITE_ONESIGNAL_*`, `RESEND_*`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `CRON_SECRET`, `FRANKFURTER_API_URL` |

Plantilla: `.env.example` → copiar a `.env.local`.

### Notas de entorno

- Usar **`localhost`**, no `127.0.0.1`, para el WEB en Windows: Vite bind a IPv6 (`::1`); `127.0.0.1:5173` da connection refused.
- El smoke de redirect exige `isSupabaseConfigured() === true` (vars `VITE_SUPABASE_*` en el Vite del stack). Sin ellas, `ProtectedRoute` en DEV entra en modo local y **no** redirige a `/login`.
- Playwright, si levanta Vite propio, usa URL/anon **dummy** (`http://e2e.local` / `e2e-anon-key`) — no son secretos; solo activan el gate de auth.
- El baseline funcional se cerró con stack local completo; no se usó cuenta QA efímera.

---

## Diagnóstico e2e (solo lectura, antes del arreglo)

Con stack arriba, fallaban 2 de 5 smokes. Evidencia (snapshot Playwright / i18n):

| Test | Esperaba (test viejo) | DOM / i18n real | Clasificación |
|------|------------------------|-----------------|---------------|
| login page | botón `/Entrar/i` | `button "Iniciar sesión"` (`auth.login.submit`) | **Test desactualizado** |
| register page | `.auth-title` “Crear cuenta” | “Crea tu cuenta en Saletse” (`auth.register.title`) | **Test desactualizado** |
| redirect `/settings` → `/login` | `/login` | Con `VITE_SUPABASE_*` del stack: **PASS** | App OK si Supabase configurado |
| (corridas previas sin stack / Vite sin supabase) | redirect | Modo local DEV: se queda en `/settings` | **Config entorno / contrato ProtectedRoute** |

**Causa raíz:** deuda del test e2e (copy i18n).  
**Arreglo:** `e2e/smoke.spec.js` + dummy supabase en `playwright.config.js` para Vite arrancado por Playwright.

---

## Tabla final de suites

| Suite | Comando | Resultado | Fecha (UTC) | SHA |
|-------|---------|-----------|-------------|-----|
| Arquitectura CI (checks 1–5) | workflow `architecture.yml` | **PASS** | 2026-10-13 | `1ddba498af2a243e16faca4a14859cb7c7c9a128` (tip; runs previos en ancestros también success) |
| Checks 1–5 local | `npm run verificar:arquitectura:checks` | **PASS** | 2026-10-13T10:17Z | mismo tip / ancestro funcional |
| verify local | `API_BASE=http://localhost:4000 WEB_BASE=http://localhost:5173 npm run verify` | **PASS** | 2026-10-13T10:17Z | |
| test:web | `npm run test:web` | **PASS** | 2026-10-13T10:17Z | |
| e2e smoke | `PLAYWRIGHT_SKIP_SERVERS=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test e2e/smoke.spec.js` | **PASS** | 2026-10-13T10:17Z | |
| Completo | `npm run verificar:arquitectura:completo` | **PASS** | 2026-10-13T10:17Z | |
| api test:security | `npm run test:security -w @salesapp/api` | **PASS** | 2026-10-13 | |

**Confirmación git:** `main` == `origin/main` @ `1ddba498af2a243e16faca4a14859cb7c7c9a128`.

---

## `npm run verificar:arquitectura:completo`

Ejecuta:

1. `verificar:arquitectura:checks` (límites, lazy, contratos tools, push, paridad shared)  
2. `npm run verify` (`API_BASE` / `WEB_BASE`)  
3. `npx playwright test e2e/smoke.spec.js` con `PLAYWRIGHT_SKIP_SERVERS=1` si el stack ya responde

**Requiere:** `npm run dev:api` y `npm run dev:web` levantados; `.env.local` con las vars de la tabla de reproducibilidad; hostname `localhost` para el WEB.

---

## Fallas restantes

Ninguna en la tabla final.
