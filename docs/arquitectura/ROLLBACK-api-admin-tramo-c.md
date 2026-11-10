# ROLLBACK — API Admin Tramo C (`49cf9a6`)

Volver al tip API previo al Tramo C admin (`1286074`):

```bash
cd /var/www/Saletse
git fetch origin main
git reset --hard 128607439dd63365212f075445cb31f8fd7f2daa
printf '%s\n' 128607439dd63365212f075445cb31f8fd7f2daa > SHA.txt
npm ci --omit=dev --no-audit --no-fund
pm2 reload saletse-api --update-env
```

No restaurar el web. El `build-id` debe seguir en `60a43e2`. Comprobar que `/health` devuelve el SHA anterior y que `GET /api/v1/admin/me` sin sesión sigue en 401.
