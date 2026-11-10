# ROLLBACK — web Expediente Tramo A (`48f4c4c`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261110-100311` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `96bad31`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-100311 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `e891793`. Comprobar `build-id.txt` y la carga de `/`.
