#!/usr/bin/env python3
import json, sys
from pathlib import Path
import paramiko

ROOT = Path(r"c:\dev\SalesApp\sales-app")

def load_env(path):
    env = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        env[k.strip()] = v
    return env

def sh(c, cmd, timeout=90):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", errors="replace"), e.read().decode("utf-8", errors="replace")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
env = load_env(ROOT / ".env.local")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env.get("VPS_HOST") or "187.77.14.148", username=env.get("VPS_USER") or "root",
          password=env["VPS_PASSWORD"], timeout=25, allow_agent=False, look_for_keys=False)

for label, user in [("postgres", "postgres"), ("supabase_admin", "supabase_admin")]:
    q = "SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public' AND tablename='flags';"
    out, err = sh(c, f"docker exec saletse-prod-db psql -U {user} -d postgres -t -A -c {json.dumps(q)}")
    print(f"OWNER_AS_{label}", out.strip() or err.strip()[:200])

MIG = ROOT / "supabase" / "migrations" / "0085_worksheet_rh_money_box_flag.sql"
s = c.open_sftp(); s.put(str(MIG), "/tmp/0085.sql"); s.close()

for user in ("supabase_admin", "postgres"):
    out, err = sh(c, f"docker exec -i saletse-prod-db psql -U {user} -d postgres -v ON_ERROR_STOP=1 < /tmp/0085.sql")
    print(f"APPLY_{user}", "OK" if "ERROR" not in (out+err) else (out+err)[-500:])

q = "SELECT clave, empresa_id::text, tipo FROM flags WHERE clave LIKE 'worksheet.royal_holiday%' OR clave='worksheet.money_box' ORDER BY 1;"
out, _ = sh(c, f"docker exec saletse-prod-db psql -U supabase_admin -d postgres -c {json.dumps(q)}")
print("FLAGS", out)

q2 = """SELECT p.slug, f.clave, pf.activo FROM paquete_flags pf
JOIN paquetes_acceso p ON p.id=pf.paquete_id
JOIN flags f ON f.id=pf.flag_id
JOIN empresas e ON e.id=p.empresa_id
WHERE e.nombre ILIKE '%Royal Holiday%' AND f.clave LIKE 'worksheet.royal_holiday%'
ORDER BY f.clave, p.slug;"""
out, _ = sh(c, f"docker exec saletse-prod-db psql -U supabase_admin -d postgres -c {json.dumps(q2)}")
print("PKG", out)

# resolver 2 roles
q3 = """
WITH rh AS (SELECT id eid FROM empresas WHERE nombre ILIKE '%Royal Holiday%' LIMIT 1),
sala AS (SELECT w.id wid FROM workspaces w, rh WHERE w.empresa_id=rh.eid AND w.tipo='sala_de_venta' LIMIT 1),
u AS (
  SELECT DISTINCT ON (r.slug) wm.usuario_id uid, r.slug
  FROM workspace_miembros wm JOIN roles r ON r.id=wm.role_id
  JOIN workspaces w ON w.id=wm.workspace_id JOIN rh ON w.empresa_id=rh.eid
  WHERE r.slug IN ('liner','cerrador') ORDER BY r.slug, wm.usuario_id
)
SELECT u.slug,
  (SELECT resolver_session_flags(u.uid,s.wid)->>'worksheet.royal_holiday.money_box' FROM sala s),
  (SELECT resolver_session_flags(u.uid,s.wid)->>'worksheet.money_box' FROM sala s)
FROM u;
"""
out, _ = sh(c, f"docker exec saletse-prod-db psql -U supabase_admin -d postgres -c {json.dumps(q3)}")
print("RESOLVER", out)

# SPA deploy check
out, _ = sh(c, "grep -l 'worksheet.royal_holiday.money_box\\|WorksheetRhMoneyBox\\|moneybox' /var/www/Saletse/apps/web/dist/assets/*.js 2>/dev/null | head -3")
print("SPA_BUNDLE", out.strip() or "(no encontrado en dist — deploy frontend pendiente)")

c.close()
