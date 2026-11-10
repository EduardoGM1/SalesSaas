# ROLLBACK — web Sync Tramo A (`48c4e20`)

**Backup VPS estable previo a Sync A:** `/opt/saletse-backups/web-dist/pre-20261110-134636` (`build-id` `3589b07`).

El backup inmediato del deploy `48c4e20` es `/opt/saletse-backups/web-dist/pre-20261110-135350` (`6eb2024`, deploy intermedio).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-134636 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `1286074`. Comprobar `build-id.txt` (`3589b07`) y la carga de `/`.
