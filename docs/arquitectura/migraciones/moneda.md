# Migración — moneda + settings FX (`moneda`)

**Rama:** `arquitectura/modulo-moneda`  
**Alcance:** módulo 2 (web). Sin deploy hasta OK.  
**API:** no tocada (conversión y settings viven en web; `/api/v1/exchange-rates` sigue en `geo-fx`).

## Estructura nueva

```
apps/web/src/modulos/moneda/
  dominio/       normalizar-tasa-usd-mxn.js, conversion-nucleo.ts (+ tests)
  servicios/     moneda-servicio.ts
  captura/       rh-formulario-moneda.js
```

UI (`components/currency/*`, `settings-page`, hooks) **no** se movió: solo actualizaron imports.

## Mapeo archivos (viejo → nuevo)

| Antes | Después |
|-------|---------|
| `apps/web/src/lib/currency/usd-to-mxn-normalize.js` | `modulos/moneda/dominio/normalizar-tasa-usd-mxn.js` |
| (inline en moneda-service) | `dominio/conversion-nucleo.ts` (puro) |
| `apps/web/src/lib/currency/moneda-service.ts` | `servicios/moneda-servicio.ts` |
| `apps/web/src/lib/currency/rh-form-currency.js` | `captura/rh-formulario-moneda.js` |
| `apps/web/src/lib/currency/conversion.test.mjs` | `dominio/conversion.test.mjs` |

## Identificadores internos

Se **conservaron** los nombres de funciones de conversión (contrato de código amplio):

`normalizeUsdToMxnRate`, `resolveUsdToMxnRate`, `convertir`, `getMonedaContext`, `isUnusualUsdToMxnRate`, `unusualUsdToMxnRateMessage`, `resolveUsdToMxnRateFromAmounts`, `toOperativa`/`mxnToUsd` (wrappers en RH vía `convertir`).

## Contratos **no** renombrados

- Settings / `sts4_user_v1`: `currency`, `exchangeRate`, `exchangeMode`, `exchangeRateUpdatedAt`, `usdToMxnRate`, `activeCaptureCurrency`
- Clave de storage `sts4_user_v1`
- HTTP: `GET /api/v1/exchange-rates` (módulo `geo-fx`)

## Paso B / A

1. Caracterización (`conversion.test.mjs`, `test-settings-fx-rate-warning`, `settings-scope` tests, `test:rh-regalos`) sobre el árbol previo.
2. Extracción de lógica pura a `conversion-nucleo` + `normalizar-tasa-usd-mxn`.
3. `git mv` a `modulos/moneda/` y actualización de imports en RH, settings, captura, hooks.

## Reversión

```bash
git checkout main
# o revert del merge cuando exista
```
