# ROLLBACK — permiso PUT preguntas (API + web)

Usar tras un deploy fallido de la rama `arquitectura/permiso-put-preguntas`.  
Sustituir `<STAMP>` por el directorio creado en el backup previo al deploy.

## Restaurar

```bash
STAMP=<STAMP>
# API
rm -rf /var/www/Saletse/apps/api
cp -a "/opt/saletse-backups/api/pre-${STAMP}" /var/www/Saletse/apps/api
# Web dist
rm -rf /var/www/Saletse/apps/web/dist
cp -a "/opt/saletse-backups/web-dist/pre-${STAMP}" /var/www/Saletse/apps/web/dist
pm2 reload saletse-api
```

## Verificar

```bash
curl -sf http://127.0.0.1:4000/health
cat "/opt/saletse-backups/api/pre-${STAMP}/SHA.txt"   # SHA previo restaurado
pm2 logs saletse-api --lines 80 --nostream
```

Sin cambios de BD que revertir (solo código API+web).
