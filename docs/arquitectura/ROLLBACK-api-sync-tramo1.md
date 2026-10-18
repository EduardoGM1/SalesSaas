# ROLLBACK — API fix de sync (tramo 1) + health/SHA

Usar tras un deploy fallido de `deploy-api-sync-tramo1.md`.  
Sustituir `<STAMP>` por el directorio del backup previo al deploy.

## Criterios de rollback automático (cualquiera basta)

1. Falla cualquier paso (a)–(e) de `smoke-sync-roundtrip-qa.mjs` o de `e2e/sync-partial-409.spec.js` contra producción.
2. Aparece cualquier duplicado: `dup_*` > 0 en la QA, o duplicados nuevos por `(user_id, prospect_code)` en la comprobación de solo lectura.
3. `/health` no devuelve el SHA de `SHA.txt` en 30 s (sonda cada 0.5 s).
4. Aumento sostenido de 5xx en la API: más 5xx por minuto que la línea base de 24 h durante 5 minutos seguidos, sin contar los 500 de `PUT /sync` que el fix elimina.
5. **Latencia:** se mide con el campo `ms` de `sync.reconcile.ok/partial` en pm2 (tiempo de servidor) y en la QA.
   - Umbral: p95 del tráfico real tras el deploy > **max(2 × p95 de la línea base, p95 de la línea base + 1500 ms)**, con al menos 5 muestras.
   - O una petición de la QA que supere 3 veces su propia mediana.
   - La línea base es el `ms` de `sync.reconcile.ok` de los 7 días anteriores a la regresión (06–13 oct), porque desde el 14-10 los PUT con expedientes fallan rápido y no son comparables.

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
