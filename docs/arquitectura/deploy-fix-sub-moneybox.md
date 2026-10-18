# Plan deploy web-only: fix `?sub=moneybox` en worksheet RH embebido

**Rama:** `arquitectura/fix-sub-moneybox`  
**Alcance:** solo web (`worksheet-royal-holiday-page.jsx`). **Sin API, sin BD.**  
**Estado:** PLAN LISTO — **NO ejecutar** sin OK explícito y CI verde del SHA exacto.

## Bug

Abrir `/clients/:id?tab=worksheet&sub=moneybox` en sala RH reescribe la URL a `sub=financiamiento` y oculta el panel Money Box. Pulsar la pestaña sí funciona.

- **Introducido en:** `4703d65` (2026-09-04, carpetas de expediente). Su padre `c43b147` no tiene la bandeja embebida. Ya presente en `eeb90b9` y `a81578c`: **no** lo introduce el módulo 6.
- **Por qué el E2E no lo vio antes de `7b3f35b`:** hasta ese commit el entorno E2E por defecto arrancaba sin Supabase configurado, los flags quedaban vacíos y la ruta RH no se ejercitaba. Con `E2E_RH=1` el reescrito se reproduce desde `4703d65`.
- **Causa:** cada `useFlag()` arranca con estado local vacío (`ready=false`, sin catálogo) hasta que `watchSession` responde. En el primer render de `WorksheetRoyalHolidayPage`, `visibleTabs` no incluye `moneybox` y el efecto de fallback llama a `onTabChange("financiamiento")`, que reescribe `sub` en la URL antes de que lleguen los flags. No es normalización de `sub` ni falta de permisos: es orden de resolución (fallback antes de flags).

## Fix

El efecto de fallback espera a `moneyBoxFlag.ready`. Sin flag Money Box, el fallback sigue llevando a la primera pestaña visible una vez resueltos los flags.

## Verificación (local)

| Chequeo | Resultado |
|---------|-----------|
| `e2e/money-box-routing.spec.js` (sin cambios, guardia) | 3/3 |
| Suite E2E completa `CI=true` | 154 passed, 5 skipped, 0 failed — baseline 0 |
| `verificar:arquitectura:completo` | verde |
| `test:web` | 54/54 |

## Backup

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SHA=$(git -C /var/www/Saletse rev-parse HEAD)
mkdir -p /opt/saletse-backups/web-dist
cp -a /var/www/Saletse/apps/web/dist "/opt/saletse-backups/web-dist/pre-${STAMP}"
printf '%s\n' "$SHA" > "/opt/saletse-backups/web-dist/pre-${STAMP}/SHA.txt"
```

## Deploy

1. Merge a `main` con Arquitectura verde y E2E sin fallos (baseline 0); usar ese SHA exacto.
2. Build web → `apps/web/dist`; publicar dist (proceso habitual, mismo que `fe26b10`).
3. Smoke: en sala RH abrir un expediente con `?tab=worksheet&sub=moneybox` → la URL conserva `sub=moneybox` y se ve el panel Money Box; cambiar a otra pestaña y volver.
4. Sin `pm2 reload` de API.

## Rollback

```bash
STAMP=<STAMP>
rm -rf /var/www/Saletse/apps/web/dist
cp -a "/opt/saletse-backups/web-dist/pre-${STAMP}" /var/www/Saletse/apps/web/dist
```
