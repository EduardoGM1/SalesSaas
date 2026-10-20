# ROLLBACK — web Agenda Tramo B (`593b53b`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261020-005151` (incluye `ROLLBACK.md`).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261020-005151 /var/www/Saletse/apps/web/dist
```

Sin reinicio Express. Comprobar `build-id.txt` y carga de `/`.
