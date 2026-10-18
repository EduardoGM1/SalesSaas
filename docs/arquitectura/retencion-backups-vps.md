# Retención de backups en el VPS

Inventario de backups con datos personales o de rollback que tienen fecha de borrado. Los backups de BD quedan **fuera del repo**, en `/opt/saletse-backups/`, con directorio 700 y archivos 600.

| Ruta | Contenido | Datos personales | Borrar cuando |
|------|-----------|------------------|---------------|
| `/opt/saletse-backups/db/pre-sync-20261018-150702/` | `pg_dump --data-only` de `prospects`, `sales`, `calendar_entries`, `activities`, `goals` y `tool_calculations`, y `counts.txt` (deploy del tramo 1 de sync) | Sí | El tramo 1 lleva 14 días estable sin rollback (no antes del 2026-11-01) |
| `/opt/saletse-backups/api/pre-20261018-150702/` | Copia de `apps/api` y `packages/shared` con `SHA.txt`, `ROLLBACK.md`, `health-before.json` y `pm2-before.json` | No (`pm2-before.json` 600: contiene el entorno del proceso) | Mismo criterio |

Pendiente de ops: política general para el resto de `/opt/saletse-backups/` (corte-3).
