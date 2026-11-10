# ROLLBACK — web Auth Tramo A (`f211cc5`)

**Backup VPS del dist previo a `f211cc5`:** `/opt/saletse-backups/web-dist/pre-20261110-144404` (`build-id` `b8c7050`).

Estable previo a Auth A: `/opt/saletse-backups/web-dist/pre-20261110-144125` (`60a43e2`).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-144125 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. Comprobar `build-id.txt` (`60a43e2`) y `/login`.
