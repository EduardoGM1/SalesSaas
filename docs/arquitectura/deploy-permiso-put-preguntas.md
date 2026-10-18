# Plan deploy: permiso PUT preguntas (API + web)

**Rama:** `arquitectura/permiso-put-preguntas`  
**Alcance:** API + web juntos. **Sin migraciones de BD.**  
**Estado:** PLAN LISTO — **NO ejecutar** sin OK explícito en el mismo mensaje.

## Precondiciones

1. CI verde en la rama / merge FF a `main`.
2. Confirmar tip: `git rev-parse HEAD` = SHA a desplegar.
3. Backup API y web-dist (abajo).
4. `ROLLBACK.md` escrito junto al backup (plantilla abajo).

## Backup

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SHA=$(git -C /var/www/Saletse rev-parse HEAD)
mkdir -p /opt/saletse-backups/api /opt/saletse-backups/web-dist
cp -a /var/www/Saletse/apps/api "/opt/saletse-backups/api/pre-${STAMP}"
cp -a /var/www/Saletse/apps/web/dist "/opt/saletse-backups/web-dist/pre-${STAMP}"
printf '%s\n' "$SHA" > "/opt/saletse-backups/api/pre-${STAMP}/SHA.txt"
printf '%s\n' "$SHA" > "/opt/saletse-backups/web-dist/pre-${STAMP}/SHA.txt"
# Copiar ROLLBACK.md (contenido de docs/arquitectura/ROLLBACK-permiso-put-preguntas.md)
cp /var/www/Saletse/docs/arquitectura/ROLLBACK-permiso-put-preguntas.md \
  "/opt/saletse-backups/api/pre-${STAMP}/ROLLBACK.md"
```

## Deploy

1. Actualizar código en VPS al SHA (pull/ff merge de `main`) y escribir `git rev-parse HEAD > /var/www/Saletse/SHA.txt` (lo hace `scripts/vps-deploy-api.py`; `/health` lo lee al arrancar).
2. Sync/build web → `apps/web/dist` (proceso habitual del repo).
3. `pm2 reload saletse-api` (o nombre del proceso).
4. Sonda: bucle `curl -sf http://127.0.0.1:4000/health` — anotar cortes.
5. Smoke: login personal → Survey → «Configurar preguntas» visible → guardar → 200.
6. (Opcional) sala sin clave: botón oculto / PUT 403.

## Rollback

Ver `ROLLBACK-permiso-put-preguntas.md`. Restaurar ambos backups + `pm2 reload` + sonda health.

## Post-check

- `main` = `origin/main` = SHA desplegado.
- API VPS = mismo SHA (`SHA.txt` o `git rev-parse` en el árbol desplegado).
- Sin errores nuevos en `pm2 logs` relacionados a survey/questions-config.
