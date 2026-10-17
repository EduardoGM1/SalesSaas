# Migración — money-box (`money-box`)

**Rama:** `arquitectura/modulo-money-box`  
**Alcance:** módulo 6 (web). Sin merge/deploy hasta OK.  
**API:** no tocada (diff `apps/api` vacío). Config RH (`rh_money_box_config`, rutas `/royal-holiday/.../money-box-config`) queda en Royal Holiday / deuda de acoplamiento.

## Inventario real (antes de mover)

| Grupo | Archivos (aprox. líneas) | Acción |
|-------|--------------------------|--------|
| **Dominio/cálculo** | `lib/calculations/money-box.ts` (~559) | **movido** |
| **UI tool** | `money-box-calculator.jsx` (~607), `money-box-page.jsx` (~65) | **movido** |
| **UI RH embebida** | `worksheet-rh-money-box-panel.jsx` (~66) | **movido** (acopla a RH worksheet + API config) |
| **Ruta legacy** | `routes/client-money-box-redirect.jsx` (~12) | **movido** |
| **Persistencia/settings** | `settings.moneyBoxConfig` vía `saveSettingsPatchRemote` / `db-store` / `settings-scope` | **deuda** (compartido) |
| **Flags** | `worksheet.money_box`, `worksheet.royal_holiday.money_box` en `tool-flags.js` + API `flags-service` | **no movido** (catálogo flags) |
| **i18n** | claves `moneyBox.*` en catálogo i18n compartido | **no movido** |
| **API RH** | `royal-holiday-service` get/save money-box-config, rutas, admin tenant | **no movido** (RH / BD `rh_money_box_config`) |
| **Tests / fixtures** | `scripts/test-money-box.mjs`, `verify-rh-money-box-pmt.mjs`, `fixtures/.../money-box.json`, e2e routing | paths actualizados |

### Acoplamiento con RH worksheet

- Panel embebido monta `MoneyBoxCalculator` con `termsFromRhFinanciamiento` (catálogo Financiamiento) y restricciones vía `royalHolidayApi.getMoneyBoxConfig` / `saveMoneyBoxRestrictions`.
- Página RH (`worksheet-royal-holiday-page.jsx`) importa `WorksheetRhMoneyBoxPanel` desde la fachada `@/modulos/money-box`.
- Persistencia de planes RH sigue en tabla `rh_money_box_config` (API); el Money Box PRO standalone usa `settings.moneyBoxConfig`.

## Estructura

```
apps/web/src/modulos/money-box/
  index.ts                         # fachada
  dominio/calculo-money-box.ts     # + aliases ES (Paso B)
  ui/
    money-box-calculator.jsx
    money-box-page.jsx
    worksheet-rh-money-box-panel.jsx
    client-money-box-redirect.jsx
```

## Mapeo

| Antes | Después |
|-------|---------|
| `lib/calculations/money-box.ts` | `modulos/money-box/dominio/calculo-money-box.ts` |
| `components/calculators/money-box-calculator.jsx` | `modulos/money-box/ui/money-box-calculator.jsx` |
| `components/calculators/money-box-page.jsx` | `modulos/money-box/ui/money-box-page.jsx` |
| `components/calculators/worksheet-rh-money-box-panel.jsx` | `modulos/money-box/ui/worksheet-rh-money-box-panel.jsx` |
| `routes/client-money-box-redirect.jsx` | `modulos/money-box/ui/client-money-box-redirect.jsx` |

## Contratos **no** renombrados

- Slug / rutas: `money-box`, `/tools/money-box`, `/clients/:id/money-box`
- Feature key UI: `money_box` (`useFeatureAccess`)
- Flags: `worksheet.money_box`, `worksheet.royal_holiday.money_box`
- Settings: `moneyBoxConfig` (+ claves `minDownPct`, `maxDownPct`, `fcCents`, …)
- i18n: `moneyBox.*`
- Columnas / tabla RH: `rh_money_box_config`
- Fixture: `scripts/architecture/fixtures/tool-data/money-box.json` (storage settings, no `tool_calculations`)

## Deuda

- Sync / outbox / `cloud-persist` / `tool-calculations-api` / `db-store` / `saveBucket` (compartido; money-box PRO ni siquiera es slug `sanitizeTool` hoy)
- `saveSettingsPatchRemote` + scope `moneyBoxConfig` en settings
- Adaptadores worksheet (`ensureWSConfig`, `WS_DEFAULTS`) y royal-holiday (`lookupFinanciamientoPlazo`) importados desde dominio
- API/BD RH money-box-config (módulo Royal Holiday futuro)
- Collab / bloqueo de campos: N/A en money-box standalone (deuda survey 5b.7 / 0090)

## Paso B / A

1. Caracterización: `npm run test:money-box` + `check-tool-contracts` (money-box.json) + casos sintéticos en suite (PMT, matriz, policy).
2. Extracción a `dominio/calculo-money-box.ts` con aliases ES; EN se mantiene para UI/tests/verify-rh.
3. `git mv` UI + fachada; `lazy-pages` → `@/modulos/money-box`; contención legacy encoge baseline.

## Reversión

```bash
git revert <sha>
# o descartar rama arquitectura/modulo-money-box
```

## Deploy (cuando OK)

Solo **web** (API diff vacío). Backup `web-dist/pre-<stamp>`, smoke UI QA + purga (`tool_calculations=0`).
