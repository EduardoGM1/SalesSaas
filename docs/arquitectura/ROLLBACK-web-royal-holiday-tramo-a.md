# ROLLBACK — web Royal Holiday Tramo A (`3589b07`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261110-111759` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `48f4c4c`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-111759 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. La API sigue en `ad3e3e3`. Comprobar `build-id.txt` y la carga de `/`.
