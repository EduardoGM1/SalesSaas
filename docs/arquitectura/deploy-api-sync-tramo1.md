# Plan de deploy — API: fix de sync (tramo 1) + health/SHA

**Estado:** OK explícito del usuario (2026-10-18) para ejecutar el deploy de API, sin esquema ni RLS.  
**Alcance:** solo API (`apps/api` y `packages/shared`, que la API carga en tiempo de ejecución). Sin cambios de BD, de RLS, de esquema, de web ni de configuración.  
**Ramas incluidas:**

- `arquitectura/sync-fix-tramo1`: fix de `PUT /sync` (`sync-fix-diseno.md`).
- `arquitectura/health-commit-comparador`: `/health` devuelve el SHA de `SHA.txt` y el deploy lo comprueba.

## 0. Precondiciones (todas obligatorias)

1. Las dos ramas mergeadas a `main` y el SHA exacto de `main` (`<SHA_NUEVO>`) con **CI verde**: Arquitectura success, y E2E con 0 fallos frente a `docs/arquitectura/e2e-baseline.md`. No se despliega ningún otro SHA.
2. Diff de producción revisado: `git diff --stat <SHA_PROD>..<SHA_NUEVO> -- apps/api packages/shared` solo contiene lo de estas dos ramas y lo ya mergeado en `main`. `<SHA_PROD>` es el que hoy reporta `/health` (hoy `aab2714`, intencional).
3. Línea base de métricas tomada **antes** del deploy (§4.1).
4. Ventana sin otros deploys en curso.

## 1. Backup (VPS)

```bash
STAMP=$(date -u +%Y%m%d-%H%M%S)
cd /var/www/Saletse
SHA_PREV=$(git rev-parse HEAD)
mkdir -p /opt/saletse-backups/api
B="/opt/saletse-backups/api/pre-${STAMP}"
mkdir -p "$B"
cp -a apps/api "$B/apps-api"
cp -a packages/shared "$B/packages-shared"
cp -a package-lock.json "$B/" 2>/dev/null || true
printf '%s\n' "$SHA_PREV" > "$B/SHA.txt"
cp docs/arquitectura/ROLLBACK-api-sync-tramo1.md "$B/ROLLBACK.md" 2>/dev/null \
  || git show "<SHA_NUEVO>:docs/arquitectura/ROLLBACK-api-sync-tramo1.md" > "$B/ROLLBACK.md"
curl -sf http://127.0.0.1:4000/health > "$B/health-before.json"
pm2 jlist > "$B/pm2-before.json"
```

No se copian `.env` ni `ecosystem` al backup, porque no cambian. Si hiciera falta, se haría en solo lectura y con permisos 600.

**Backup lógico de datos** (solo lectura: `pg_dump --data-only`, sin tocar la BD) de las 6 tablas cuyo patrón de escritura cambia:

```bash
D="/opt/saletse-backups/db/pre-sync-${STAMP}"
install -d -m 700 "$D"
docker exec saletse-prod-db pg_dump -U supabase_admin -d postgres --data-only \
  -t public.prospects -t public.sales -t public.calendar_entries -t public.activities \
  -t public.goals -t public.tool_calculations | gzip > "$D/sync-tables.sql.gz"
chmod 600 "$D/sync-tables.sql.gz"
# + conteos de referencia por tabla en $D/counts.txt (600)
```

Contiene datos personales: queda fuera del repo, en el VPS, con permisos 600. **Retención:** borrar cuando el tramo 1 lleve 14 días estable sin rollback; anotarlo en la política de retención de backups. No se restaura automáticamente: un rollback de código no lo necesita, porque los datos escritos por el fix son legítimos.

## 2. Deploy

```bash
cd /var/www/Saletse
git fetch -q origin main
test "$(git rev-parse origin/main)" = "<SHA_NUEVO>" || { echo "origin/main no es el SHA con CI verde"; exit 1; }
git checkout -q --detach "<SHA_NUEVO>"
git rev-parse HEAD > SHA.txt            # lo lee /health (resolveBuildCommit)
git diff --quiet "$SHA_PREV" HEAD -- package-lock.json || npm ci --omit=dev --no-audit --no-fund
pm2 reload saletse-api --update-env
```

**Sonda** (cada 0.5 s, hasta 30 s; si falla o el commit no coincide con SHA.txt, ROLLBACK inmediato):

```bash
for i in $(seq 1 60); do
  H=$(curl -sf http://127.0.0.1:4000/health) && [ "$(echo "$H" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit"))')" = "$(cat SHA.txt)" ] && break
  H=""; sleep 0.5
done
echo "$H"
test "$(echo "$H" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit"))')" = "$(cat SHA.txt)" \
  || { echo "health commit != SHA.txt"; exit 1; }
curl -s -o /dev/null -w 'public /health %{http_code}\n' -H 'Host: 187.77.14.148' http://127.0.0.1/health
pm2 logs saletse-api --lines 40 --nostream | grep -E '"level":"(error|fatal)"' | tail -5
```

`scripts/vps-deploy-api.py` (rama health) automatiza el SHA.txt y la comprobación de `/health`, pero hace `reset --hard origin/main`, `npm ci` siempre y recarga nginx. Para este deploy se usan los pasos manuales de arriba: un SHA fijo, sin tocar nginx y `npm ci` solo si cambia el lockfile.

## 3. Rollback

Ver `ROLLBACK-api-sync-tramo1.md`. Se vuelve al SHA previo con `git checkout`, se restauran las copias si el checkout no basta y se hace `pm2 reload` con sonda. No hay estado de BD nuevo que revertir. Las filas que suban mientras tanto son datos legítimos del usuario y se quedan.

## 4. Verificación en producción

### 4.1 Antes/después en logs (solo lectura, conteos agregados, sin ids)

Ventana: 24 h antes del deploy y 2 h, 24 h y 48 h después.

```bash
pm2 logs saletse-api --lines 200000 --nostream 2>/dev/null \
  | grep -oE '"msg":"sync\.reconcile\.(ok|partial|failed)"' | sort | uniq -c
pm2 logs saletse-api --lines 200000 --nostream 2>/dev/null \
  | grep '"sync.reconcile.partial"' | grep -oE '"rejected":\{[^}]*\}' | sort | uniq -c | sort -rn | head
```

El logger escribe el evento en `msg` (`apps/api/src/lib/logger.js`). Los conteos `inserted`, `updated`, `deduped`, `skipped` y `rejected` van en la misma línea.

| Métrica | Esperado |
|---------|----------|
| `sync.reconcile.failed` con `upsert prospects` RLS | Bajar de unos 700/día por usuario afectado a **0**. Ya no hay errores RLS que aborten: pasan a `partial` |
| `sync.reconcile.ok` de usuarios con expedientes | Pasar de 0 (desde el 14-10) a > 0 en las primeras horas |
| `sync.reconcile.partial` por código | Solo códigos explicables (`borrado_bloqueado`, `conflicto_oculto`, `sin_permiso`…); ninguno `otro` |
| Tasa de 5xx de `PUT /sync` (nginx) | Bajar; ningún 5xx nuevo |
| 409 de `PUT /sync` (nginx) | Aparecen solo junto a `partial`; con tendencia a bajar al deduplicar los reintentos |

### 4.2 Solo lectura en BD (conteos, `begin read only … rollback`)

- Duplicados por `(user_id, workspace_id, prospect_code)`, y en `calendar_entries` por `(user_id, created_at, entry_date, type)`: **sin cambio** respecto a la línea base.
- Expedientes con `user_id` distinto del creador según el workflow: **sin cambio**, 0 reasignaciones.
- Filas con `workspace_id` nulo en las tablas del CRM: 0.

### 4.3 QA efímera (cuenta QA con credenciales aleatorias fuera del repo, en su workspace personal)

**Automatizado y en los smokes estándar post-deploy de API:**

```bash
API_BASE=http://187.77.14.148 node scripts/architecture/smoke-sync-roundtrip-qa.mjs   # (a)–(d) + purga a 0 + latencias
PLAYWRIGHT_SKIP_SERVERS=1 PLAYWRIGHT_BASE_URL=<web prod> npx playwright test e2e/sync-partial-409.spec.js  # (e)
```

El smoke da a las 2 QA el rol de plataforma `liner`, como un usuario real. Sin él, el workspace personal no tiene `expedientes:crear` ni `metas:ver_editar_propias`, y REST y la RLS rechazan igual. La agenda usa `type` del enum `entry_type` (`venta|nota|follow|descanso`). No es viable en CI: necesita la BD real y SSH al VPS para el helper.

1. **Fila nueva:** `PUT /sync` con un blob de 1 expediente nuevo (id UUID nuevo) y 1 entrada de agenda. Se espera 200, `data.clients` con el expediente y, en BD, **1** fila de cada.
2. **Reenvío idempotente:** el mismo blob, con ids legacy no-UUID regenerados por `normalizeIds`, 3 veces. Se espera 200 cada vez y **sigue habiendo 1** fila de cada (log: `deduped`, sin `inserted`).
3. **409 sin pérdida:** un blob con un expediente cuyo id pertenece a una fila no visible para la cuenta QA (creada con otra cuenta QA en otro workspace) más un expediente válido. Sin cabecera, se espera **409** `sync_partial` sin `data`, con la fila válida guardada y 1 rechazo `conflicto_oculto`. Con `X-Sync-Protocol: 2`, 200 con `partial: true`. En el navegador (opcional): la base local y el outbox se conservan (lo cubre también `e2e/sync-partial-409.spec.js`).
4. **Purga:** borrar las cuentas QA y sus filas con el procedimiento habitual y verificar **0** filas QA restantes en `prospects`, `calendar_entries`, `prospects_deleted` y `profiles`.

### 4.4 Criterios de corte (rollback inmediato y stop)

- La sonda de `/health` falla o el commit no coincide con SHA.txt.
- Sube la tasa de 5xx.
- Aparece un duplicado nuevo o una reasignación de dueño.
- Aparece una clase de error nueva sin explicar (`otro`).
- La QA del paso 1 o del paso 2 no da exactamente 1 fila.
