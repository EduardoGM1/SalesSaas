# Migración piloto — geo + exchange-rates (`geo-fx`)

**Rama:** `arquitectura/piloto-geo-fx`  
**Alcance:** solo módulo 1. Sin deploy. Contratos HTTP/settings intactos.

## Estructura nueva

```
apps/api/src/modulos/geo-fx/
  dominio/       catalogo-geo.js, tipo-cambio-nucleo.js (+ tests)
  servicios/     geo-servicio.js, tipo-cambio-servicio.js
  controladores/ geo-controlador.js, tipo-cambio-controlador.js
  rutas/         geo.js, tipo-cambio.js

apps/web/src/modulos/geo-fx/
  api/           sincronizar-tipo-cambio.js
  proveedores/   sincronizacion-tipo-cambio.jsx
```

## Mapeo archivos (viejo → nuevo)

| Antes | Después |
|-------|---------|
| `apps/api/src/lib/geo-catalog.js` | `modulos/geo-fx/dominio/catalogo-geo.js` |
| `apps/api/src/lib/exchange-rates.js` | `dominio/tipo-cambio-nucleo.js` + `servicios/tipo-cambio-servicio.js` |
| `apps/api/src/services/geo-service.js` | `servicios/geo-servicio.js` |
| `apps/api/src/controllers/geo-controller.js` | `controladores/geo-controlador.js` |
| `apps/api/src/controllers/exchange-rates-controller.js` | `controladores/tipo-cambio-controlador.js` |
| `apps/api/src/routes/geo.js` | `rutas/geo.js` |
| `apps/api/src/routes/exchange-rates.js` | `rutas/tipo-cambio.js` |
| `apps/web/src/lib/exchange-rate-sync.js` | `modulos/geo-fx/api/sincronizar-tipo-cambio.js` |
| `apps/web/src/components/providers/exchange-rate-sync.jsx` | `proveedores/sincronizacion-tipo-cambio.jsx` |

Montaje: `apps/api/src/routes/v1.js` importa las rutas del módulo (paths HTTP sin cambio).

## Mapeo funciones (interno)

| Antes | Después | Notas |
|-------|---------|-------|
| `listCountries` | `listarPaises` | |
| `findCountry` | `buscarPais` | |
| `listCities` | `listarCiudades` | |
| `getCountries` / `getCities` | `obtenerPaises` / `obtenerCiudades` | servicio |
| `isSupportedCurrency` | `esMonedaSoportada` | |
| `getUsdExchangeRate` | `obtenerTipoCambioUsd` | I/O en servicio |
| (inline parse rate) | `interpretarRespuestaProveedor` | puro (paso B) |
| (inline USD fixed) | `armarResultadoUsdFijo` | puro |
| `fetchExchangeRate` | `obtenerTipoCambioRemoto` | alias legacy exportado |
| `refreshAutoExchangeRate` | `refrescarTipoCambioAutomatico` | alias legacy |
| `ExchangeRateSync` | `SincronizacionTipoCambio` | alias legacy |

## Contratos **no** renombrados

- `GET /api/v1/geo/countries`, `GET /api/v1/geo/countries/:country/cities`
- `GET /api/v1/exchange-rates?to=`
- Payload `{ data: { base, to, rate, date, source } }` y shape de países/ciudades (`name`, `iso`, `flag`, `cities`, …)
- Settings: `exchangeRate`, `usdToMxnRate`, `exchangeMode`, `currency`
- Rate-limit name `"exchange-rates"`
- Catálogo compartido `COUNTRY_CITY` / `COUNTRY_FLAGS` en `@salesapp/shared`

## Fuera de alcance (módulo 2+)

- `apps/web/src/lib/currency/moneda-service.ts` y `usd-to-mxn-normalize.js` (caracterizados con tests; move en etapa moneda/settings)
- `country-city-selects.jsx` (UI expediente; usa constants locales)

## Reversión

```bash
git checkout main
# o: git revert <rango de commits de la rama> / reset --hard al tip de main
```

Un revert del merge (cuando exista) o descartar la rama restaura el árbol previo.
