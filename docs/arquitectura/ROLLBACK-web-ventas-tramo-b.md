# ROLLBACK — web Ventas Tramo B (`b48c729`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261020-184334` (incluye `ROLLBACK.md`). El `build-id.txt` de ese backup es `be395b8`.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261020-184334 /var/www/Saletse/apps/web/dist
```

Sin reinicio de Express. Comprobar `build-id.txt` y la carga de `/`.
