# Rollback — API notificaciones Tramo C

**Alcance:** solo `apps/api` (+ `packages/shared` si el checkout lo trae). Sin cambios de BD. Web no se toca.

## Objetivo

Volver la API al SHA previo al Tramo C: **`72a3ca4`** (último tip de API en producción antes de este deploy).

## Procedimiento

1. En el checkout de la API en el VPS: `git fetch origin` y `git checkout --detach 72a3ca4`.
2. Escribir `SHA.txt` con ese commit.
3. Si `package-lock.json` cambió respecto al tip nuevo, `npm ci --omit=dev`.
4. `pm2 reload saletse-api --update-env`.
5. Sonda `/health` cada 0,5 s hasta que `commit` = contenido de `SHA.txt`.
6. Confirmar que el web (`build-id`) sigue en el tip web previo (no restaurar `web-dist` salvo incidente aparte).

## Criterios que disparan rollback automático

- `/health` no alcanza el SHA nuevo tras el reload.
- 5xx sostenidos o latencia > umbral (doble de la línea base RO o +1500 ms).
- `scheduled_push_jobs`: pico anómalo de `failed`, o ausencia de `pending` esperados tras la QA.
- Fallo de las verificaciones QA post-deploy (401, schedule, flush acotado, purga, smokes).

## Restaurar desde backup de directorio

Si el checkout git no basta: copiar de vuelta `apps/api` y `packages/shared` desde el backup `api/pre-<stamp>` (con su `SHA.txt` / `ROLLBACK.md`), reload y sonda.
