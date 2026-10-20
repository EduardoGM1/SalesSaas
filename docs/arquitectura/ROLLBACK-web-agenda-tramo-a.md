# ROLLBACK — web Agenda Tramo A (`be395b8`)

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-20261020-015232` (incluye `ROLLBACK.md` + `SHA.txt`).

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-20261020-015232 /var/www/Saletse/apps/web/dist
```

Sin reinicio Express. Comprobar `build-id.txt` y carga de `/`.
