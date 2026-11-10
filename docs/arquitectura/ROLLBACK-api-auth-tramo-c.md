# ROLLBACK — API Auth Tramo C (`92776e1`)

Volver al tip API previo (`612d6d6`):

```bash
cd /var/www/Saletse
git fetch origin main
git reset --hard 612d6d62154416fe0c0a708cdccd8e65350d1018
printf '%s\n' 612d6d62154416fe0c0a708cdccd8e65350d1018 > SHA.txt
npm ci --omit=dev --no-audit --no-fund
pm2 reload saletse-api --update-env
```

No restaurar el web (`f211cc5`). Comprobar `/health` y `GET /api/v1/auth/session` sin sesión → 401.
