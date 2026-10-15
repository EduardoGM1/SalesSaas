# Scripts del monorepo

Utilidades de desarrollo, despliegue, seeds y verificación. La API y el web también tienen scripts en `apps/*/package.json`.

## Uso permanente (mantener en git)

| Área | Scripts | Cómo correr |
|------|---------|-------------|
| **npm raíz** | Ver `package.json` → `scripts/*` | `npm run verify`, `npm run test:rh-regalos`, `npm run rh:seed`, etc. |
| **Deploy VPS web** | `build-web-vps-prod.py`, `deploy-web-dist-prod.py`, `spa_selfhosted_guard.py` | Documentado en `docs/MAPA-GENERAL-SISTEMA.md` |
| **Deploy API** | `vps-deploy-api.py`, `vps_ssh.py` | Clave SSH `VPS_SSH_KEY` |
| **Schema RH** | `sync-rh-schema-staging.py`, `diagnose-rh-schema-staging-prod.py` | Python desde raíz del repo |
| **Migraciones** | `apply-migration.mjs` | `npm run db:migrate` / CI `migrate.yml` |
| **Presentación RH** | `test-presentacion-img-budget.mjs`, `remeasure-presentacion-ssim.mjs`, `smoke-presentacion-expediente-prod.mjs` | Node; smoke prod provisiona cuenta `@salesapp-qa.invalid` y purga al final |
| **Cuentas prueba RH** | `provision-prueba-rh-roles.py` | Credenciales en `scripts/.env.prueba-rh-lalo` (plantilla `.example`) |
| **Staging local** | Túnel + `scripts/.env.staging-smoke` | Plantilla `.env.staging-smoke.example` |

## Smokes y E2E

- **Playwright CI:** `e2e/` vía `npm run test:e2e`.
- **Smokes manuales versionados** (p. ej. `smoke-presentacion-img.mjs`): credenciales solo `E2E_EMAIL` / `E2E_PASSWORD`; si faltan, el script termina con error claro.
- **No crear** un smoke nuevo por feature: reutilizar un script parametrizado por entorno (`PLAYWRIGHT_BASE_URL`, `E2E_*`).

### Arquitectura — checks (`scripts/architecture/`)

| Script | Qué |
|--------|-----|
| `check-legacy-containment.mjs` | No crecer carpetas legacy; baseline `legacy-baseline.json` |
| `check-module-facades.mjs` | Imports cruzados solo por `modulos/<nombre>/index` |
| `legacy-containment-exceptions.json` | Excepciones justificadas (`file` + `reason`) |

Docs: `docs/arquitectura/contencion-y-fachadas.md`.

### Arquitectura — smokes UI QA efímera (`scripts/architecture/`)

Reutilizables; provisionan cuenta `@saletse-test.com`, credenciales en `%TEMP%` (nunca en el repo) y purgan a conteos 0.

| Script | Qué cubre | Cómo |
|--------|-----------|------|
| `qa-geo-fx-ephemeral.py` | Helper VPS: provision / counts / purge / `seed-prospect` / `seed-collab-share` / `check-broadcast-policy` | `python scripts/architecture/qa-geo-fx-ephemeral.py …` (SSH vía `vps_ssh`; secrets solo env VPS) |
| `smoke-geo-fx-ui-qa.mjs` | UI geo + FX settings + expediente offline | `node scripts/architecture/smoke-geo-fx-ui-qa.mjs` (`PLAYWRIGHT_BASE_URL`) |
| `smoke-moneda-ui-qa.mjs` | Settings FX (sembrar `usdToMxnRate=1` → 18, PATCH sin clave ≤1), captura, Move In 4000 MXN | `node scripts/architecture/smoke-moneda-ui-qa.mjs` |
| `smoke-metas-ui-qa.mjs` | Crear/editar meta, KPIs, dashboard `/goals`; purga incl. `goals=0` | `node scripts/architecture/smoke-metas-ui-qa.mjs` |
| `smoke-vacaciones-ui-qa.mjs` | Expediente → Vacaciones: capturar, resultados, guardar; purga `tool_calculations=0` | `node scripts/architecture/smoke-vacaciones-ui-qa.mjs` |
| `smoke-survey-ui-qa.mjs` | Expediente → Survey: capturar, resultados, guardar; purga `tool_calculations=0` | `node scripts/architecture/smoke-survey-ui-qa.mjs` |
| `smoke-survey-collab-e2e-qa.mjs` | **Gate collab Survey:** 2 QA personales, presencia + sync; bloqueo de campo = KNOWN GAP (ver `docs/arquitectura/pendiente-bloqueo-campos-collab.md`) | `PLAYWRIGHT_BASE_URL=… node scripts/architecture/smoke-survey-collab-e2e-qa.mjs` |
| `smoke-realtime-broadcast-negative-qa.mjs` | Pruebas negativas Realtime: C sin share y B en expediente no compartido deben ser rechazados | `node scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs` (env Supabase overlay) |
| `build-web-ci.mjs` | Vite build con `VITE_*` placeholder (CI / completo) | `npm run build:web:ci` |
| `smoke-geo-fx.mjs` | Solo lecturas API geo/FX (sin auth) | `API_BASE=… node scripts/architecture/smoke-geo-fx.mjs` |

Contraseñas: `randomBytes` en runtime. Sin URLs/claves fijas en el código.  
Helper `qa-geo-fx-ephemeral.py` cuenta/borra `goals`, `tool_calculations`, `prospect_shares`, invites, `user_connections` y `workspace_miembros` de la cuenta QA.

#### Gate colaboración Survey (manual)

Ver docstring de `smoke-survey-collab-e2e-qa.mjs`: solo workspaces `personal` efímeros via `seed-collab-share` (share edit + guest en WS personal del dueño para RLS `tool_calculations`; no `sala_de_venta` ni empresa). **Esta rama no incluye migraciones de BD.** El bloqueo de campo por broadcast es KNOWN GAP hasta tarea aparte post-5b.3 (`pendiente-bloqueo-campos-collab.md`).

## Scratch (no versionar)

- Salidas: `scripts/.smoke-*-shots/`, `scripts/.diag-*`, `scripts/.audit-*`, `scripts/.db-cleanup-*.json`.
- One-off: prefijos `_tmp-`, `_diag-` → usar `scripts/.tmp/` o tmp del sistema y borrar al terminar (ver regla Cursor).
- `_archive/` local: no commitear; histórico va a zip fuera del repo si hace falta.

## Secretos

- Nunca contraseñas ni service role en código.
- Solo plantillas `scripts/.env.*.example` en git.
- Ops destructivos en prod: documentación y scripts sensibles fuera del repo (zip de archivo local).
