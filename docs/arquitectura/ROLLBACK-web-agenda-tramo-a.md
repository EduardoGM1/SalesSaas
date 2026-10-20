# ROLLBACK — web Agenda Tramo A

**Backup VPS:** `/opt/saletse-backups/web-dist/pre-<stamp>` (incluye `ROLLBACK.md` en el propio backup). Completar `<stamp>` al desplegar.

```bash
sudo rm -rf /var/www/Saletse/apps/web/dist
sudo cp -a /opt/saletse-backups/web-dist/pre-<stamp> /var/www/Saletse/apps/web/dist
```

Sin reinicio Express. Comprobar `build-id.txt` y carga de `/`.
