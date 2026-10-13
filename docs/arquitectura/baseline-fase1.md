# Baseline Fase 1 — red de seguridad

**Fecha (UTC):** 2026-10-13T08:24:29.242Z  
**SHA:** `9f2b5ac33f92da4353dc0a0ad1f0dded93de4bed`  
**Rama:** `test/arquitectura-red-seguridad`  
**Comando:** `npm run verificar:arquitectura` / `node scripts/architecture/run-baseline.mjs`

## Suite ejecutada

| Paso | Exit | Duración | Resultado |
|------|------|----------|-----------|
| test:web | 0 | 1276ms | PASS |
| api test:security | 0 | 1598ms | PASS |
| verify (local) | 1 | 598ms | FAIL |
| e2e smoke | 1 | 49516ms | FAIL |

## Resumen

- **Checks arquitectura (1–5):** ver salida de `verificar:arquitectura` (límites, lazy, contratos, push, paridad).
- **Baseline suite:** 2 fallo(s).
- Fallos: verify (local), e2e smoke.

## Notas

- Sin secretos ni datos reales en fixtures.
- **Checks 1–5 (red de seguridad): PASS** en esta corrida (vía `verificar:arquitectura` / `verificar:arquitectura:checks`).
- **test:web + api test:security: PASS.**
- **verify (local): FAIL** — no había API/web en `127.0.0.1:4000` / `:5173` (esperado sin `dev:api`/`dev:web`).
- **e2e smoke: FAIL parcial** — health/API vía proxy OK (2); UI login/register/redirect a login fallan (selectores / sesión residual en `:5173`). No es regresión introducida por la red de seguridad; documentar y estabilizar en CI limpio.
- E2E smoke no provisiona cuentas QA.
- No se hizo deploy ni merge a `main`.


## Colas de salida (últimas líneas)

### test:web (exit 0)

```
  ...
# Subtest: mergeSettingsForWorkspace usa workspaces[id] remoto solo si la sala local está vacía
ok 12 - mergeSettingsForWorkspace usa workspaces[id] remoto solo si la sala local está vacía
  ---
  duration_ms: 0.345
  type: 'test'
  ...
# Subtest: buildProfileSettingsBody no pone worksheetConfig en la raíz
ok 13 - buildProfileSettingsBody no pone worksheetConfig en la raíz
  ---
  duration_ms: 0.3139
  type: 'test'
  ...
# Subtest: hasWorkspaceSettings distingue blob vacío de config real
ok 14 - hasWorkspaceSettings distingue blob vacío de config real
  ---
  duration_ms: 0.1577
  type: 'test'
  ...
# Subtest: pickUserGlobalSettings trata usdToMxnRate ≤ 1 / no numérico como ausente
ok 15 - pickUserGlobalSettings trata usdToMxnRate ≤ 1 / no numérico como ausente
  ---
  duration_ms: 0.4332
  type: 'test'
  ...
# Subtest: hydrate local=1 + incoming={} no reinfecta usdToMxnRate
ok 16 - hydrate local=1 + incoming={} no reinfecta usdToMxnRate
  ---
  duration_ms: 0.4845
  type: 'test'
  ...
1..16
# tests 26
# suites 6
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 168.7845
```

### api test:security (exit 0)

```
  ...
# Subtest: POST /auth/login sin cuerpo no es 500 (rate limit intacto)
ok 56 - POST /auth/login sin cuerpo no es 500 (rate limit intacto)
  ---
  duration_ms: 15.0618
  type: 'test'
  ...
# {"ts":"2026-10-13T08:24:31.577Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":false,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# {"ts":"2026-10-13T08:24:31.581Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":true,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# {"ts":"2026-10-13T08:24:31.581Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":true,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# {"ts":"2026-10-13T08:24:31.582Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":true,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# {"ts":"2026-10-13T08:24:31.584Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":false,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# {"ts":"2026-10-13T08:24:31.584Z","level":"info","msg":"rh.catalog.cache","request_id":null,"user_id":null,"tenant_id":null,"hit":false,"empresa_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
# Subtest: catálogo vigente: segundo get y preview reusan cache (sin repetir las 8 queries)
ok 57 - catálogo vigente: segundo get y preview reusan cache (sin repetir las 8 queries)
  ---
  duration_ms: 7.3786
  type: 'test'
  ...
# Subtest: invalidateCatalogoVigenteCache fuerza recarga
ok 58 - invalidateCatalogoVigenteCache fuerza recarga
  ---
  duration_ms: 0.806
  type: 'test'
  ...
# Subtest: resolveActiveWorkspaceId reusa knownList y no vuelve a consultar membresías
ok 59 - resolveActiveWorkspaceId reusa knownList y no vuelve a consultar membresías
  ---
  duration_ms: 1.8639
  type: 'test'
  ...
1..59
# tests 59
# suites 0
# pass 59
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 997.218
```

### verify (local) (exit 1)

```
> sales-saas@0.1.0 verify
> node scripts/verify-smoke.mjs


=== Smoke test API=http://127.0.0.1:4000 WEB=http://127.0.0.1:5173 ===

✗ API health → fetch failed
✗ API root → fetch failed
✗ Geo countries → fetch failed
✗ Profile sin auth → fetch failed
✗ Reminders sin auth → fetch failed
✗ SPA index → fetch failed

6 fallo(s).
```

### e2e smoke (exit 1)

```
    Usage:

        npx playwright show-trace test-results\smoke-Smoke-E2E-ruta-protegida-redirige-a-login-sin-sesión-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  3 failed
    e2e\smoke.spec.js:4:7 › Smoke E2E › login page carga ───────────────────────────────────────────
    e2e\smoke.spec.js:10:7 › Smoke E2E › register page carga ───────────────────────────────────────
    e2e\smoke.spec.js:15:7 › Smoke E2E › ruta protegida redirige a login sin sesión ────────────────
  2 passed (47.4s)
::notice title=🎭 Playwright Run Summary::  3 failed%0A    e2e\smoke.spec.js:4:7 › Smoke E2E › login page carga ───────────────────────────────────────────%0A    e2e\smoke.spec.js:10:7 › Smoke E2E › register page carga ───────────────────────────────────────%0A    e2e\smoke.spec.js:15:7 › Smoke E2E › ruta protegida redirige a login sin sesión ────────────────%0A  2 passed (47.4s)
(node:12244) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:12244) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:11040) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:11040) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:4008) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:4008) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:14824) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:14824) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1692) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1692) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:12000) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:12000) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:17772) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:17772) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
```

