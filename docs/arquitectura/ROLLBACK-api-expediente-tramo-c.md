# Rollback — API expediente Tramo C

**Alcance:** solo API. Sin cambios de BD. El web no se toca (`build-id` `48f4c4c`).

## Objetivo

Volver la API al SHA previo: **`e891793e12fc2389effc6f7fbc0725b71827b8a2`**.

## Procedimiento

1. En el checkout de la API: `git fetch origin` y `git checkout --detach e891793e12fc2389effc6f7fbc0725b71827b8a2`.
2. Escribir `SHA.txt` con ese commit.
3. `npm ci --omit=dev` si cambió el lockfile.
4. `pm2 reload saletse-api --update-env`.
5. Comprobar `/health` hasta que `commit` coincida con `SHA.txt`.
6. No restaurar el `web-dist`.

## Backup de directorio

`/opt/saletse-backups/api/pre-20261110-103353` (código previo `e891793e12fc2389effc6f7fbc0725b71827b8a2`, incluye `SHA.txt` y `ROLLBACK.md`). Restaurar esa copia, escribir `SHA.txt` en la raíz del checkout y recargar el proceso si el checkout no basta.
