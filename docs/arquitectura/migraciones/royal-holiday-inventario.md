# Royal Holiday — inventario

**Estado inventario.** Sin moves. Las fórmulas ya viven en `packages/shared` y se quedan ahí. Sin cambios de BD ni de paths HTTP.

## Qué ya está hecho

`apps/web/src/lib/calculations/royal-holiday.js` solo reexporta `@salesapp/shared/calculations/royal-holiday.js`. No hay un dominio nuevo que extraer. `handleCancelacionVenta` sigue como import dinámico desde ventas.

## Tramo A — UI

Páginas de `pages/rh`, la hoja `worksheet-royal-holiday-page.jsx`, los paneles de worksheet que solo sirven a Royal Holiday y `opc-expediente-page.jsx`. Las rutas no cambian: `/clients/opc-nuevo`, `/tools/rh/*` y `/ops/rh/*`. El lazy de OPC sigue exportando `OpcExpedientePage`.

## Tramo C — API

`routes/royal-holiday.js`, su controlador y `royal-holiday-service.js`. Paths y códigos iguales. El cliente `royal-holiday-api.js` pasa a la fachada del módulo.

## Qué no entra

| Pieza | Por qué |
|-------|---------|
| `packages/shared/src/calculations/royal-holiday*.js` | Dominio compartido. No se mueve ni se regenera desde el web |
| Money Box | Módulo 6. Sigue importando el cálculo y, después del Tramo A, la fachada |
| `sync.js`, `db-store`, outbox | Compartido con sync |
| Agenda de descansos ya migrada | El módulo de agenda no se reabre |

## Verificación

Caracterizar rutas, nombres lazy y códigos de la API antes de cada move. Humo efímero con purga a 0 en el Tramo C. El guard de expediente no cubre esta rama: hace falta uno propio que prohíba `packages/shared/src/calculations/**`, `sync.js`, `db-store` y outbox.
