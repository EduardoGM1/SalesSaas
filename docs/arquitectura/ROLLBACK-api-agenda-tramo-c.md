# Rollback — API agenda Tramo C

**Alcance:** solo API. Sin cambios de BD. El web no se toca.

## Objetivo

Volver la API al SHA previo: **`acda4f7ab843e79eff62846edc5bab42a608b5d8`**.

## Procedimiento

1. En el checkout de la API: `git fetch origin` y `git checkout --detach acda4f7ab843e79eff62846edc5bab42a608b5d8`.
2. Escribir `SHA.txt` con ese commit.
3. `npm ci --omit=dev` si cambió el lockfile.
4. `pm2 reload saletse-api --update-env`.
5. Comprobar `/health` hasta que `commit` coincida con `SHA.txt`.
6. No restaurar el `web-dist`.

## Backup de directorio

`/opt/saletse-backups/api/pre-20261020-105812` (código previo `acda4f7`, incluye `ROLLBACK.md` y `SHA.txt`). Restaurar esa copia, escribir `SHA.txt` en la raíz del checkout y recargar el proceso si el checkout no basta.
