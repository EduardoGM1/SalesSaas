# ROLLBACK — API Royal Holiday Tramo C (`273d25b`)

**Backup VPS:** `/opt/saletse-backups/api/pre-20261110-113500`. El `SHA.txt` de ese backup es `ad3e3e3fa75d77a7fe54050f302ead76b01e6341`.

```bash
cd /var/www/Saletse
git fetch origin main
git reset --hard ad3e3e3fa75d77a7fe54050f302ead76b01e6341
printf '%s\n' ad3e3e3fa75d77a7fe54050f302ead76b01e6341 > SHA.txt
npm ci --omit=dev --no-audit --no-fund
pm2 reload saletse-api --update-env
```

No restaurar el web. El `build-id` debe seguir en `3589b07`. Comprobar que `/health` devuelve el SHA anterior.
