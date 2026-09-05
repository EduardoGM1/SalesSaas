#!/usr/bin/env python3
"""
Verificación puntual en prod: WORKSPACE_PERMISSION_DENIED vía requireWorkspacePermission.
Crea cuentas QA desechables, login real (Playwright), confirma 403 vs 200, limpia sí o sí.
No modifica código de producto.
"""
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
VPS_ENV = "/var/www/Saletse/.env"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL_DENIED = "qa-permission-denied-verify@saletse-test.com"
EMAIL_ALLOWED = "qa-permission-allowed-verify@saletse-test.com"
ROLE_SLUG = "qa-perm-denied-verify"
PERM = "ventas:cancelar"
RESULTS = ROOT / "scripts" / ".qa-permission-denied-results.json"
EMAILS = [EMAIL_DENIED, EMAIL_ALLOWED]
PERSONAL_NAMES = ["QA Perm Denied Verify", "QA Perm Allowed Verify"]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)


def load_local_env():
    data = {}
    if ENV_LOCAL.is_file():
        for raw in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def fetch_vps_env(client):
    _, o, _ = client.exec_command(f"cat {VPS_ENV}", timeout=30)
    data = {}
    for line in o.read().decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def psql(client, sql):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i saletse-prod-db "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if "ERROR:" in out or "ERROR:" in err:
        raise RuntimeError((out + err)[-2500:])
    return out + err


def auth_request(base, anon, service, method, path, body=None):
    import urllib.error
    import urllib.request

    url = f"{base.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {service}",
            "apikey": anon,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return ex.code, payload


def quoted_emails():
    return ", ".join(f"'{e}'" for e in EMAILS)


def purge_qa_data(client):
    q = quoted_emails()
    psql(
        client,
        f"""
SET session_replication_role = replica;
DELETE FROM sales s USING profiles p
WHERE s.user_id = p.id AND p.email IN ({q});
DELETE FROM activities a USING profiles p
WHERE a.user_id = p.id AND p.email IN ({q});
DELETE FROM goals g USING profiles p
WHERE g.user_id = p.id AND p.email IN ({q});
DELETE FROM tool_calculations t USING profiles p
WHERE t.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflow_events e
USING prospects pr, profiles p
WHERE e.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflow_events e
USING profiles p
WHERE e.actor_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflows w
USING prospects pr, profiles p
WHERE w.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_messages m
USING chat_conversations c, prospects pr, profiles p
WHERE m.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_members cm
USING chat_conversations c, prospects pr, profiles p
WHERE cm.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_conversations c
USING prospects pr, profiles p
WHERE c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospects pr USING profiles p
WHERE pr.user_id = p.id AND p.email IN ({q});
SET session_replication_role = origin;
""",
    )


def purge_users(client, personal_ids=None):
    q = quoted_emails()
    extra = ""
    if personal_ids:
        ids = ", ".join(f"'{i}'" for i in personal_ids if i)
        if ids:
            extra = f"DELETE FROM workspaces WHERE id IN ({ids}) AND tipo = 'personal';"
    try:
        purge_qa_data(client)
    except Exception as ex:
        print(f"  WARN purge data: {ex}")
    psql(
        client,
        f"""
SET session_replication_role = replica;
{sql_capture_qa_personal_workspaces(EMAILS, PERSONAL_NAMES)}
DELETE FROM workspace_usuario_permisos_override o USING profiles p
WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM usuario_permisos_override o USING profiles p
WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM permisos_delegados d USING profiles p
WHERE (d.usuario_asistente_id = p.id OR d.otorgado_por = p.id OR d.usuario_delegante_id = p.id)
  AND p.email IN ({q});
DELETE FROM workspace_miembros wm USING profiles p
WHERE wm.usuario_id = p.id AND p.email IN ({q});
DELETE FROM empresa_miembros em USING profiles p
WHERE em.usuario_id = p.id AND p.email IN ({q});
DELETE FROM flag_reglas fr USING profiles p
WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({q});
UPDATE profiles SET role_id = NULL WHERE email IN ({q});
{extra}
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({q});
DELETE FROM auth.users WHERE email IN ({q});
DELETE FROM profiles WHERE email IN ({q});
DELETE FROM rol_permisos rp USING roles r
WHERE rp.rol_id = r.id AND r.empresa_id = '{RH_ID}' AND r.slug = '{ROLE_SLUG}';
DELETE FROM roles WHERE empresa_id = '{RH_ID}' AND slug = '{ROLE_SLUG}';
SET session_replication_role = origin;
""",
    )


def ensure_auth_user(base, anon, service, email, full_name, password):
    status, listed = auth_request(base, anon, service, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    if status != 200:
        raise RuntimeError(f"listUsers: HTTP {status} {listed}")
    users = listed.get("users") or []
    existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if existing:
        uid = existing["id"]
        st, body = auth_request(base, anon, service, "PUT", f"/auth/v1/admin/users/{uid}", {
            "email_confirm": True,
            "password": password,
            "user_metadata": {"full_name": full_name},
        })
        if st not in (200, 201):
            raise RuntimeError(f"updateUser: HTTP {st} {body}")
        return uid
    st, created = auth_request(base, anon, service, "POST", "/auth/v1/admin/users", {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    })
    if st not in (200, 201):
        raise RuntimeError(f"createUser {email}: HTTP {st} {created}")
    uid = created.get("id") or created.get("user", {}).get("id")
    if not uid:
        raise RuntimeError(f"createUser sin id: {created}")
    return uid


def last_line(text):
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1] if lines else ""


def main():
    local = load_local_env()
    host = local.get("VPS_HOST", "187.77.14.148")
    password_vps = local.get("VPS_PASSWORD")
    if not password_vps:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=local.get("VPS_USER", "root"),
        password=password_vps,
        timeout=25,
        allow_agent=False,
        look_for_keys=False,
    )
    vps = fetch_vps_env(client)
    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")
    if not anon or not service:
        print("Faltan keys en VPS .env", file=sys.stderr)
        sys.exit(1)

    denied_password = secrets.token_urlsafe(10) + "Aa1!"
    allowed_password = secrets.token_urlsafe(10) + "Aa1!"
    personal_denied = None
    personal_allowed = None
    uid_denied = None
    uid_allowed = None
    rc = 1
    try:
        print("=== PURGE previo ===")
        purge_users(client)

        print("=== Código desplegado (sales-service.eliminarVenta) ===")
        _, o, e = client.exec_command(
            "sed -n '65,70p' /var/www/Saletse/apps/api/src/services/sales-service.js; "
            "echo '---controller---'; sed -n '29,31p' /var/www/Saletse/apps/api/src/controllers/sales-controller.js; "
            "echo '---route---'; grep -n 'sales/:id' /var/www/Saletse/apps/api/src/routes/sales.js",
            timeout=20,
        )
        deployed = (o.read() + e.read()).decode("utf-8", errors="replace")
        print(deployed)

        print("=== Catálogo: liner vanilla SÍ tiene ventas:cancelar ===")
        liner_has = last_line(
            psql(
                client,
                f"""
SELECT COUNT(*)::text
FROM rol_permisos rp
JOIN roles r ON r.id = rp.rol_id
JOIN permisos p ON p.id = rp.permiso_id
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner' AND p.clave = '{PERM}';
""",
            )
        )
        print(f"  liner rol_permisos {PERM} count={liner_has}")
        if liner_has not in ("1",):
            raise RuntimeError(f"esperaba que liner tenga {PERM}, count={liner_has}")

        print("=== Crear rol QA = liner SIN ventas:cancelar ===")
        psql(
            client,
            f"""
INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT r.empresa_id, 'QA perm denied verify', '{ROLE_SLUG}', r.scope, r.paquete_id, false
FROM roles r
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT qa.id, rp.permiso_id
FROM roles qa
JOIN roles liner ON liner.empresa_id = qa.empresa_id AND liner.slug = 'liner'
JOIN rol_permisos rp ON rp.rol_id = liner.id
JOIN permisos p ON p.id = rp.permiso_id
WHERE qa.empresa_id = '{RH_ID}' AND qa.slug = '{ROLE_SLUG}' AND p.clave <> '{PERM}'
ON CONFLICT DO NOTHING;
""",
        )
        qa_has = last_line(
            psql(
                client,
                f"""
SELECT COUNT(*)::text
FROM rol_permisos rp
JOIN roles r ON r.id = rp.rol_id
JOIN permisos p ON p.id = rp.permiso_id
WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{ROLE_SLUG}' AND p.clave = '{PERM}';
""",
            )
        )
        qa_total = last_line(
            psql(
                client,
                f"""
SELECT COUNT(*)::text
FROM rol_permisos rp
JOIN roles r ON r.id = rp.rol_id
WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{ROLE_SLUG}';
""",
            )
        )
        liner_total = last_line(
            psql(
                client,
                f"""
SELECT COUNT(*)::text
FROM rol_permisos rp
JOIN roles r ON r.id = rp.rol_id
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner';
""",
            )
        )
        print(f"  QA rol {PERM} count={qa_has} (debe ser 0); claves QA={qa_total} liner={liner_total}")
        if qa_has not in ("0",):
            raise RuntimeError(f"el rol QA no debe tener {PERM}")

        print("=== CREAR usuarios Auth ===")
        uid_denied = ensure_auth_user(base, anon, service, EMAIL_DENIED, "QA Perm Denied Verify", denied_password)
        uid_allowed = ensure_auth_user(base, anon, service, EMAIL_ALLOWED, "QA Perm Allowed Verify", allowed_password)
        print(f"  denied uid={uid_denied}")
        print(f"  allowed uid={uid_allowed}")

        print("=== WORKSPACES + membresía RH ===")
        personal_denied = last_line(psql(client, f"SELECT public.ensure_personal_workspace('{uid_denied}');"))
        personal_allowed = last_line(psql(client, f"SELECT public.ensure_personal_workspace('{uid_allowed}');"))
        psql(
            client,
            f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES
  ('{RH_ID}', '{uid_denied}', false, 'activo'),
  ('{RH_ID}', '{uid_allowed}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false, estado = 'activo';

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_denied}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{ROLE_SLUG}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = 'vendedor';

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_allowed}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = 'vendedor';

UPDATE profiles SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false
WHERE id IN ('{uid_denied}', '{uid_allowed}');
""",
        )

        perm_check = psql(
            client,
            f"""
SELECT
  (SELECT r.slug FROM workspace_miembros wm JOIN roles r ON r.id = wm.role_id
   WHERE wm.usuario_id = '{uid_denied}' AND wm.workspace_id = '{SALA_RH_ID}'),
  (SELECT COUNT(*) FROM rol_permisos rp
   JOIN workspace_miembros wm ON wm.role_id = rp.rol_id
   JOIN permisos p ON p.id = rp.permiso_id
   WHERE wm.usuario_id = '{uid_denied}' AND wm.workspace_id = '{SALA_RH_ID}' AND p.clave = '{PERM}'),
  (SELECT r.slug FROM workspace_miembros wm JOIN roles r ON r.id = wm.role_id
   WHERE wm.usuario_id = '{uid_allowed}' AND wm.workspace_id = '{SALA_RH_ID}'),
  (SELECT COUNT(*) FROM rol_permisos rp
   JOIN workspace_miembros wm ON wm.role_id = rp.rol_id
   JOIN permisos p ON p.id = rp.permiso_id
   WHERE wm.usuario_id = '{uid_allowed}' AND wm.workspace_id = '{SALA_RH_ID}' AND p.clave = '{PERM}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{uid_denied}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{uid_allowed}');
""",
        ).strip()
        print(f"  membership/perm: {perm_check}")
        parts = [p.strip() for p in perm_check.split("|")]
        if parts[0] != ROLE_SLUG or parts[1] != "0":
            raise RuntimeError(f"cuenta denied aún tiene {PERM} o rol incorrecto: {perm_check}")
        if parts[2] != "liner" or parts[3] != "1":
            raise RuntimeError(f"cuenta allowed no tiene {PERM} vía liner: {perm_check}")
        if parts[4] == "t" or parts[5] == "t":
            raise RuntimeError("ninguna cuenta QA debe ser super_admin")

        print("\n=== PLAYWRIGHT (login real) ===")
        env = os.environ.copy()
        env.update({
            "PLAYWRIGHT_BASE_URL": base,
            "QA_DENIED_EMAIL": EMAIL_DENIED,
            "QA_DENIED_PASSWORD": denied_password,
            "QA_ALLOWED_EMAIL": EMAIL_ALLOWED,
            "QA_ALLOWED_PASSWORD": allowed_password,
            "QA_PERM_RESULTS": str(RESULTS),
        })
        proc = subprocess.run(
            ["node", str(ROOT / "scripts" / "qa-permission-denied-verify.mjs")],
            env=env,
            cwd=str(ROOT),
        )
        pw_rc = proc.returncode

        extra = {}
        if RESULTS.is_file():
            extra = json.loads(RESULTS.read_text(encoding="utf-8"))
        denied_sale = (extra.get("denied") or {}).get("saleId")
        allowed_sale = (extra.get("allowed") or {}).get("saleId")

        print("\n=== DB post-intento ===")
        db_after = psql(
            client,
            f"""
SELECT
  (SELECT COUNT(*) FROM sales WHERE user_id = '{uid_denied}'),
  (SELECT COUNT(*) FROM sales WHERE id = {'NULL' if not denied_sale else f"'{denied_sale}'"}),
  (SELECT COUNT(*) FROM sales WHERE user_id = '{uid_allowed}'),
  (SELECT COUNT(*) FROM sales WHERE id = {'NULL' if not allowed_sale else f"'{allowed_sale}'"});
""",
        ).strip()
        print(f"  counts denied_user, denied_sale_id, allowed_user, allowed_sale_id = {db_after}")
        db_parts = [p.strip() for p in db_after.split("|")]
        denied_sale_still_there = db_parts[1:2] == ["1"]
        allowed_sale_gone = db_parts[3:4] == ["0"] or not allowed_sale
        extra["dbAfter"] = {
            "raw": db_after,
            "deniedSaleStillThere": denied_sale_still_there,
            "allowedSaleGone": allowed_sale_gone,
            "deniedSaleId": denied_sale,
            "allowedSaleId": allowed_sale,
        }
        extra["deployedSnippet"] = deployed[-1500:]
        extra["catalog"] = {
            "permission": PERM,
            "linerHas": liner_has,
            "qaRoleHas": qa_has,
            "membership": perm_check,
        }

        print("=== Nginx DELETE /api/v1/sales (últimas) ===")
        _, o, e = client.exec_command(
            "grep -h 'DELETE /api/v1/sales/' /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null | tail -n 8",
            timeout=20,
        )
        nginx = (o.read() + e.read()).decode("utf-8", errors="replace")
        print(nginx or "(sin líneas)")
        extra["nginx"] = nginx[-1500:]
        RESULTS.write_text(json.dumps(extra, indent=2), encoding="utf-8")

        denied_http_ok = (
            (extra.get("checks") or {}).get("denied_403_workspace_permission_denied", {}).get("pass") is True
        )
        allowed_http_ok = (extra.get("checks") or {}).get("allowed_delete_ok", {}).get("pass") is True
        if pw_rc == 0 and denied_http_ok and allowed_http_ok and denied_sale_still_there and allowed_sale_gone:
            rc = 0
        else:
            print(
                "  FAIL criterios: "
                f"pw={pw_rc} denied_http={denied_http_ok} allowed_http={allowed_http_ok} "
                f"denied_sale_still={denied_sale_still_there} allowed_sale_gone={allowed_sale_gone}"
            )
            rc = 1
    finally:
        print("\n=== LIMPIEZA ===")
        try:
            purge_users(client, personal_ids=[personal_denied, personal_allowed])
            left_p = last_line(psql(client, f"SELECT COUNT(*) FROM profiles WHERE email IN ({quoted_emails()});"))
            left_u = last_line(psql(client, f"SELECT COUNT(*) FROM auth.users WHERE email IN ({quoted_emails()});"))
            left_m = last_line(
                psql(
                    client,
                    f"""
SELECT COUNT(*) FROM workspace_miembros wm
JOIN profiles p ON p.id = wm.usuario_id
WHERE p.email IN ({quoted_emails()});
""",
                )
            )
            left_role = last_line(
                psql(
                    client,
                    f"SELECT COUNT(*) FROM roles WHERE empresa_id = '{RH_ID}' AND slug = '{ROLE_SLUG}';",
                )
            )
            left_ws = last_line(psql(client, sql_leftover_qa_personal_workspaces(EMAILS, PERSONAL_NAMES))).split("|")[-1].strip()
            print(
                f"  perfiles={left_p} auth.users={left_u} workspace_miembros={left_m} rol_qa={left_role} ws_personal={left_ws}"
            )
            if left_p not in ("0", "") or left_u not in ("0", "") or left_m not in ("0", "") or left_role not in ("0", "") or left_ws not in ("0", ""):
                print("  WARN: limpieza incompleta")
                rc = 1
            else:
                print("  cuentas QA y rol temporal eliminados por completo")
        except Exception as ex:
            print(f"  LIMPIEZA FALLÓ: {ex}")
            rc = 1
        client.close()

    if RESULTS.is_file():
        print("\n=== CHECKS ===")
        data = json.loads(RESULTS.read_text(encoding="utf-8"))
        for k, v in (data.get("checks") or {}).items():
            mark = "PASS" if v.get("pass") else "FAIL"
            print(f"  [{mark}] {k}: {v.get('detail')}")
        print(f"JSON: {RESULTS}")

    sys.exit(rc)


if __name__ == "__main__":
    main()
