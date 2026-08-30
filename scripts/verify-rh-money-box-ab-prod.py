#!/usr/bin/env python3
import base64, paramiko
from pathlib import Path

EID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
env = {k.strip(): v.strip().strip('"').strip("'") for k,v in [l.split('=',1) for l in Path(r"c:/dev/SalesApp/sales-app/.env.local").read_text().splitlines() if '=' in l and not l.strip().startswith('#')]}
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("187.77.14.148", username="root", password=env["VPS_PASSWORD"], timeout=25, allow_agent=False, look_for_keys=False)

def run(sql):
    b64 = base64.b64encode(sql.encode()).decode()
    _, o, e = c.exec_command(f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres", timeout=60)
    return o.read().decode('utf-8','replace') + e.read().decode('utf-8','replace')

print("=== role_flags / puesto flags ===")
print(run(f"""
SELECT r.slug, array_agg(rf.flag_id::text) AS flag_ids
FROM roles r
LEFT JOIN role_flags rf ON rf.role_id = r.id
WHERE r.empresa_id='{EID}'
GROUP BY r.slug ORDER BY r.slug;
"""))

print("=== asistente vs gerente detalle ===")
print(run(f"""
SELECT r.slug, r.paquete_id, p.slug AS paquete,
  (SELECT jsonb_agg(f.clave) FROM role_flags rf JOIN flags f ON f.id=rf.flag_id WHERE rf.role_id=r.id) AS role_flag_claves
FROM roles r LEFT JOIN paquetes_acceso p ON p.id=r.paquete_id
WHERE r.empresa_id='{EID}' AND r.slug IN ('asistente_sala','gerente','liner','cerrador');
"""))

SALA = run(f"SELECT id FROM workspaces WHERE empresa_id='{EID}' AND tipo='sala_de_venta' LIMIT 1;").strip().split('\n')[-2].strip()
print("SALA", SALA)

print("\n=== TEST A/B: operacion-base OFF then ON ===")
for phase, activo in [("OFF", "false"), ("ON", "true")]:
    print(f"\n--- {phase} operacion-base paquete flag ---")
    print(run(f"""
UPDATE paquete_flags SET activo = {activo}
WHERE paquete_id = (SELECT id FROM paquetes_acceso WHERE empresa_id='{EID}' AND slug='operacion-base')
  AND flag_id = (SELECT id FROM flags WHERE clave='worksheet.royal_holiday.money_box' AND empresa_id='{EID}');
"""))
    print(run(f"""
WITH sala AS (SELECT id FROM workspaces WHERE empresa_id='{EID}' AND tipo='sala_de_venta' LIMIT 1),
u AS (
  SELECT wm.usuario_id, r.slug FROM workspace_miembros wm
  JOIN roles r ON r.id=wm.role_id JOIN sala s ON s.id=wm.workspace_id
)
SELECT u.slug,
  resolver_workspace_flag('worksheet.royal_holiday.money_box', u.usuario_id, s.id) AS rh_mb
FROM u, sala s ORDER BY u.slug;
"""))

print("\n=== SIM liner user (hypothetical): paquete liner ON vs cierre-only user ===")
print(run(f"""
WITH sala AS (SELECT id FROM workspaces WHERE empresa_id='{EID}' AND tipo='sala_de_venta' LIMIT 1),
hypo AS (
  SELECT
    (SELECT usuario_id FROM workspace_miembros wm JOIN roles r ON r.id=wm.role_id JOIN sala s ON s.id=wm.workspace_id WHERE r.slug='gerente' LIMIT 1) AS uid,
    'gerente_operacion-base' AS label
  UNION ALL
  SELECT
    (SELECT usuario_id FROM workspace_miembros wm JOIN roles r ON r.id=wm.role_id JOIN sala s ON s.id=wm.workspace_id WHERE r.slug='asistente_sala' LIMIT 1),
    'asistente_sin_paquete'
)
SELECT h.label,
  resolver_workspace_flag('worksheet.royal_holiday.money_box', h.uid, s.id) AS with_default,
  resolver_workspace_flag('worksheet.royal_holiday', h.uid, s.id) AS parent_rh
FROM hypo h, sala s;
"""))

# Toggle cierre OFF, operacion-base ON - simulate cerrador package without mb if we had user
print("\n=== Package-level: cierre OFF, operacion-base ON ===")
print(run(f"""
UPDATE paquete_flags SET activo = false
WHERE paquete_id = (SELECT id FROM paquetes_acceso WHERE empresa_id='{EID}' AND slug='cierre')
  AND flag_id = (SELECT id FROM flags WHERE clave='worksheet.royal_holiday.money_box' AND empresa_id='{EID}');
UPDATE paquete_flags SET activo = true
WHERE paquete_id = (SELECT id FROM paquetes_acceso WHERE empresa_id='{EID}' AND slug='operacion-base')
  AND flag_id = (SELECT id FROM flags WHERE clave='worksheet.royal_holiday.money_box' AND empresa_id='{EID}');
"""))
print(run(f"""
SELECT p.slug,
  resolver_workspace_flag('worksheet.royal_holiday.money_box',
    (SELECT usuario_id FROM workspace_miembros wm JOIN roles r ON r.id=wm.role_id WHERE r.paquete_id = p.id LIMIT 1),
    (SELECT id FROM workspaces WHERE empresa_id='{EID}' AND tipo='sala_de_venta' LIMIT 1)
  ) AS would_resolve_if_user_on_paquete
FROM paquetes_acceso p
WHERE p.empresa_id='{EID}'
ORDER BY p.slug;
"""))
print("RESTORE cierre")
print(run(f"""
UPDATE paquete_flags SET activo = true
WHERE paquete_id = (SELECT id FROM paquetes_acceso WHERE empresa_id='{EID}' AND slug='cierre')
  AND flag_id = (SELECT id FROM flags WHERE clave='worksheet.royal_holiday.money_box' AND empresa_id='{EID}');
"""))

c.close()
