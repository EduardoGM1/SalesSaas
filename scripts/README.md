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

## Scratch (no versionar)

- Salidas: `scripts/.smoke-*-shots/`, `scripts/.diag-*`, `scripts/.audit-*`, `scripts/.db-cleanup-*.json`.
- One-off: prefijos `_tmp-`, `_diag-` → usar `scripts/.tmp/` o tmp del sistema y borrar al terminar (ver regla Cursor).
- `_archive/` local: no commitear; histórico va a zip fuera del repo si hace falta.

## Secretos

- Nunca contraseñas ni service role en código.
- Solo plantillas `scripts/.env.*.example` en git.
- Ops destructivos en prod: documentación y scripts sensibles fuera del repo (zip de archivo local).
