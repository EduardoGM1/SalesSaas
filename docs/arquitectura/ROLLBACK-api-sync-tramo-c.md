# ROLLBACK — API Sync Tramo C (`1286074`)

**Backup VPS:** `/opt/saletse-backups/api/pre-20261110-131514`. El `SHA.txt` de ese backup es `273d25bd30b42b26383915c5b54d9599b1cde24e`.

```bash
cd /var/www/Saletse
git fetch origin main
git reset --hard 273d25bd30b42b26383915c5b54d9599b1cde24e
printf '%s\n' 273d25bd30b42b26383915c5b54d9599b1cde24e > SHA.txt
npm ci --omit=dev --no-audit --no-fund
pm2 reload saletse-api --update-env
```

No restaurar el web. El `build-id` debe seguir en `3589b07`. Comprobar que `/health` devuelve el SHA anterior.
