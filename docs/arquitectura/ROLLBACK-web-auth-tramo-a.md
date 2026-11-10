# ROLLBACK — web Auth Tramo A parcial (`b8c7050`)

**Backup VPS del dist previo:** `/opt/saletse-backups/web-dist/pre-20261110-144125` (`build-id` `60a43e2`).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-144125 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `612d6d6` (o tip posterior). Comprobar `build-id.txt` (`60a43e2`) y `/login`.
