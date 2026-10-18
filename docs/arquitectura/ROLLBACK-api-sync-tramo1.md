# ROLLBACK — API fix de sync (tramo 1) + health/SHA

Usar tras un deploy fallido de `deploy-api-sync-tramo1.md`.  
Sustituir `<STAMP>` por el directorio del backup previo al deploy.

## Restaurar

```bash
STAMP=<STAMP>
B="/opt/saletse-backups/api/pre-${STAMP}"
cd /var/www/Saletse
git checkout -q --detach "$(cat "$B/SHA.txt")"
# Si el checkout no deja el árbol idéntico (archivos locales), restaurar las copias:
# rm -rf apps/api packages/shared && cp -a "$B/apps-api" apps/api && cp -a "$B/packages-shared" packages/shared
git diff --quiet "<SHA_NUEVO>" HEAD -- package-lock.json || npm ci --omit=dev --no-audit --no-fund
cp "$B/SHA.txt" SHA.txt
pm2 reload saletse-api --update-env
```

## Verificar

```bash
for i in $(seq 1 15); do H=$(curl -sf http://127.0.0.1:4000/health) && break; sleep 2; done
echo "$H"                       # commit = SHA previo (si el código previo no lee SHA.txt, puede salir el de git)
cat "$B/SHA.txt"
diff <(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit"))' "$B/health-before.json") \
     <(echo "$H" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit"))')
pm2 logs saletse-api --lines 80 --nostream
```

Sin cambios de BD que revertir: solo código de la API. Las filas que se sincronizaron durante el deploy son datos legítimos de los usuarios y se quedan.
