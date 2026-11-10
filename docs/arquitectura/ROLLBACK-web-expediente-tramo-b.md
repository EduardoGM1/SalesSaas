# ROLLBACK — web Expediente Tramo B (`96bad31`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261110-090238` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `cfed2da`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-090238 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `e891793`. Comprobar `build-id.txt` y la carga de `/`.
