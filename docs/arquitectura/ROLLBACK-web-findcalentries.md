# ROLLBACK — web fix `findCalEntries` (`3acb234`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261020-191803` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `b48c729`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261020-191803 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. Comprobar `build-id.txt` y la carga de `/`.
