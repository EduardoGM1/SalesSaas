# Baseline Fase 1 — red de seguridad (funcional)

**Fecha (UTC):** 2026-10-13T10:17:35Z  
**SHA funcional (e2e/completo):** `7b3f35baf1d905a46f26d194f509e20baa680b35`  
**SHA tip `main`:** `3c9bda6005aafc33631800e49afecc72447c6d3f`  
**Rama:** `main` (`main` == `origin/main`)  
**Deploy:** no  
**Piloto:** no iniciado

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
| Opcionales | `SUPABASE_PUBLIC_URL`, `ONESIGNAL_*`, `VITE_ONESIGNAL_*`, `RESEND_*`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `CRON_SECRET` |

Plantilla: `.env.example` → copiar a `.env.local`.

### Notas de entorno

- Usar **`localhost`**, no `127.0.0.1`, para el WEB en Windows: Vite bind a IPv6 (`::1`); `127.0.0.1:5173` da connection refused.
- El smoke de redirect exige `isSupabaseConfigured() === true` (vars `VITE_SUPABASE_*` en el Vite del stack). Sin ellas, `ProtectedRoute` en DEV entra en modo local y **no** redirige a `/login` (comportamiento de producto documentado, no bug del smoke).
- Playwright, si levanta Vite propio, usa URL/anon **dummy** (`http://e2e.local` / `e2e-anon-key`) — no son secretos; solo activan el gate de auth.
- No se usó staging ni cuenta QA efímera: el stack local completo fue suficiente.

---

## Diagnóstico e2e (solo lectura, antes del arreglo)

Con stack arriba, fallaban 2 de 5 smokes. Evidencia (snapshot Playwright / i18n):

| Test | Esperaba (test viejo) | DOM / i18n real | Clasificación |
|------|------------------------|-----------------|---------------|
| login page | botón `/Entrar/i` | `button "Iniciar sesión"` (`auth.login.submit`) | **Test desactualizado** |
| register page | `.auth-title` “Crear cuenta” | “Crea tu cuenta en Saletse” (`auth.register.title`) | **Test desactualizado** |
| redirect `/settings` → `/login` | `/login` | Con `VITE_SUPABASE_*` del stack: **PASS** | App OK si Supabase configurado |
| (corridas previas sin stack / Vite sin supabase) | redirect | Modo local DEV: se queda en `/settings` | **Config entorno / contrato ProtectedRoute**, no bug nuevo |

**Causa raíz:** deuda del test e2e (copy i18n), no bug de producto ni de la red de seguridad.  
**Arreglo aplicado (solo `e2e/smoke.spec.js` + dummy supabase en `playwright.config.js` para Vite que Playwright arranca):** selectores alineados al catálogo i18n; Playwright ya no fuerza `VITE_SUPABASE_URL=""`.

---

## Tabla final de suites

| Suite | Comando | Resultado | Fecha (UTC) | Notas |
|-------|---------|-----------|-------------|-------|
| Arquitectura CI (checks 1–5) | workflow `architecture.yml` run [#3](https://github.com/EduardoGM1/SalesSaas/actions/runs/38381724446) | **PASS** | 2026-10-13T10:12:32Z | `main` @ `a7fb2aa`, conclusion `success` |
| Checks 1–5 local | `npm run verificar:arquitectura:checks` | **PASS** | 2026-10-13T10:17Z | |
| verify local | `API_BASE=http://localhost:4000 WEB_BASE=http://localhost:5173 npm run verify` | **PASS** | 2026-10-13T10:17Z | Stack `dev:api` + `dev:web` |
| test:web | `npm run test:web` | **PASS** | 2026-10-13T10:17Z | 26 tests |
| e2e smoke | `PLAYWRIGHT_SKIP_SERVERS=1 PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test e2e/smoke.spec.js` | **PASS** | 2026-10-13T10:17Z | 5/5 tras fix de selectores |
| Completo | `npm run verificar:arquitectura:completo` | **PASS** | 2026-10-13T10:17Z | checks + verify + e2e smoke |
| api test:security | `npm run test:security -w @salesapp/api` | **PASS** | (corrida previa misma rama) | No parte de `:completo`; baseline previo verde |

**SHA de la corrida funcional:** `7b3f35baf1d905a46f26d194f509e20baa680b35`.  
**Confirmación git:** `main` == `origin/main` tras el FF merge `a7fb2aa`.

---

## `npm run verificar:arquitectura:completo`

Ejecuta:

1. `verificar:arquitectura:checks` (límites, lazy, contratos tools, push, paridad shared)  
2. `npm run verify` (`API_BASE` / `WEB_BASE`)  
3. `npx playwright test e2e/smoke.spec.js` con `PLAYWRIGHT_SKIP_SERVERS=1` si el stack ya responde

**Requiere:** `npm run dev:api` y `npm run dev:web` levantados; `.env.local` con las vars de la tabla de reproducibilidad; hostname `localhost` para el WEB.

---

## Fallas restantes

Ninguna en la tabla final. No hay fallas “esperadas” sin causa: las del baseline anterior se cerraron (stack + fix de test).
