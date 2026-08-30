#!/usr/bin/env python3
"""Verifica resolver_workspace_flag ON/OFF por rol en prod (sin auth RPC)."""
import base64
import paramiko
from pathlib import Path

EID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
env = {}
for raw in Path(r"c:/dev/SalesApp/sales-app/.env.local").read_text(encoding="utf-8").splitlines():
    if "=" in raw and not raw.strip().startswith("#"):
        k, v = raw.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("187.77.14.148", username="root", password=env["VPS_PASSWORD"], timeout=25, allow_agent=False, look_for_keys=False)

def run(sql):
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres"
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    return out + (f"\nSTDERR: {err}" if err.strip() else "")

def resolve(role_slug):
    return run(f"""
WITH sala AS (
  SELECT id FROM workspaces WHERE empresa_id = '{EID}' AND tipo = 'sala_de_venta' LIMIT 1
),
u AS (
  SELECT wm.usuario_id
  FROM workspace_miembros wm
  JOIN roles r ON r.id = wm.role_id
  CROSS JOIN sala s
  WHERE wm.workspace_id = s.id AND r.slug = '{role_slug}'
  LIMIT 1
)
SELECT
  '{role_slug}' AS role,
  u.usuario_id,
  resolver_workspace_flag('worksheet.royal_holiday', u.usuario_id, s.id) AS rh_ws,
  resolver_workspace_flag('worksheet.royal_holiday.money_box', u.usuario_id, s.id) AS rh_mb,
  resolver_workspace_flag('worksheet.money_box', u.usuario_id, s.id) AS pro_mb
FROM u, sala s;
""")

print("=== FLAGS INDEPENDIENTES (tabla) ===")
print(run(f"""
SELECT clave, tipo, empresa_id IS NULL AS global, flag_padre IS NOT NULL AS has_parent
FROM flags WHERE clave IN ('worksheet.money_box','worksheet.royal_holiday','worksheet.royal_holiday.money_box')
ORDER BY clave;
"""))

print("=== PAQUETE_FLAGS RH money_box ===")
print(run(f"""
SELECT p.slug, pf.activo
FROM paquete_flags pf
JOIN paquetes_acceso p ON p.id = pf.paquete_id
JOIN flags f ON f.id = pf.flag_id
WHERE p.empresa_id = '{EID}' AND f.clave = 'worksheet.royal_holiday.money_box'
ORDER BY p.slug;
"""))

print("=== RESOLVER liner / cerrador / gerente ===")
for slug in ("liner", "cerrador", "gerente", "ftb"):
    print(resolve(slug))

print("=== SIM: liner OFF (toggle paquete) ===")
print(run(f"""
UPDATE paquete_flags SET activo = false
WHERE paquete_id IN (SELECT id FROM paquetes_acceso WHERE empresa_id = '{EID}' AND slug = 'liner')
  AND flag_id IN (SELECT id FROM flags WHERE clave = 'worksheet.royal_holiday.money_box' AND empresa_id = '{EID}');
"""))
print(resolve("liner"))
print(resolve("cerrador"))

print("=== RESTORE liner ON ===")
print(run(f"""
UPDATE paquete_flags SET activo = true
WHERE paquete_id IN (SELECT id FROM paquetes_acceso WHERE empresa_id = '{EID}' AND slug = 'liner')
  AND flag_id IN (SELECT id FROM flags WHERE clave = 'worksheet.royal_holiday.money_box' AND empresa_id = '{EID}');
"""))
print(resolve("liner"))

print("=== SPA deploy check ===")
_, o, _ = c.exec_command("grep -l 'worksheet.royal_holiday.money_box\\|WorksheetRhMoneyBox\\|moneybox' /var/www/Saletse/apps/web/dist/assets/*.js 2>/dev/null | head -5", timeout=30)
print(o.read().decode("utf-8", errors="replace") or "(sin coincidencias — frontend no desplegado)")

c.close()
