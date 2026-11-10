# Rollback — API ventas Tramo C

**Alcance:** solo API. Sin cambios de BD. El web no se toca (`build-id` `cfed2da`).

## Objetivo

Volver la API al SHA previo: **`0b635827ccf23c2162b9b70fb7922333c47ff220`**.

## Procedimiento

1. En el checkout de la API: `git fetch origin` y `git checkout --detach 0b635827ccf23c2162b9b70fb7922333c47ff220`.
2. Escribir `SHA.txt` con ese commit.
3. `npm ci --omit=dev` si cambió el lockfile.
4. `pm2 reload saletse-api --update-env`.
5. Comprobar `/health` hasta que `commit` coincida con `SHA.txt`.
6. No restaurar el `web-dist`.

## Backup de directorio

`/opt/saletse-backups/api/pre-20261110-030443` (código previo `0b635827ccf23c2162b9b70fb7922333c47ff220`, incluye `SHA.txt` y `ROLLBACK.md`). Restaurar esa copia, escribir `SHA.txt` en la raíz del checkout y recargar el proceso si el checkout no basta.
