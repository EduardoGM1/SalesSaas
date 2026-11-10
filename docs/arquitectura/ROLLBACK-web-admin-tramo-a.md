# ROLLBACK — web Admin Tramo A (`60a43e2`)

**Backup VPS del dist previo:** `/opt/saletse-backups/web-dist/pre-20261110-142534` (`build-id` `48c4e20`).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-142534 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `1286074`. Comprobar `build-id.txt` (`48c4e20`) y la carga de `/` y `/admin`.
