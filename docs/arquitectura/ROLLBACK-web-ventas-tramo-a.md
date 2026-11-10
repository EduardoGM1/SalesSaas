# ROLLBACK — web Ventas Tramo A (`cfed2da`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261110-022240` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `3acb234`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261110-022240 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. Comprobar `build-id.txt` y la carga de `/`.
