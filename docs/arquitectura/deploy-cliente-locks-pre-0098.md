# Plan deploy web-only: cliente locks (antes de 0098)

**Rama:** `arquitectura/bloqueo-campos-collab-diseno`  
**Alcance:** solo web (`expediente-realtime` + helpers). **Sin API, sin BD.**  
**Estado:** PLAN LISTO — **NO ejecutar** sin OK explícito. Desplegar **antes** del canario 0098.

## Cambios

1. Best-effort `field_unlock` en teardown/`pagehide` (antes de `untrack`).
2. Throttle de `console.warn` en send fallido de lock/unlock.
3. Multi-pestaña: pendiente documentado (no en este deploy).

## Backup

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SHA=$(git -C /var/www/Saletse rev-parse HEAD)
mkdir -p /opt/saletse-backups/web-dist
cp -a /var/www/Saletse/apps/web/dist "/opt/saletse-backups/web-dist/pre-${STAMP}"
printf '%s\n' "$SHA" > "/opt/saletse-backups/web-dist/pre-${STAMP}/SHA.txt"
```

## Deploy

1. Build web → `apps/web/dist`.
2. Publicar dist (proceso habitual).
3. Smoke: abrir expediente con collab, cerrar pestaña con foco en campo → peer pierde lock por unlock o leave/TTL ≤60s.
4. Sin `pm2 reload` de API.

## Rollback

```bash
STAMP=<STAMP>
rm -rf /var/www/Saletse/apps/web/dist
cp -a "/opt/saletse-backups/web-dist/pre-${STAMP}" /var/www/Saletse/apps/web/dist
```
