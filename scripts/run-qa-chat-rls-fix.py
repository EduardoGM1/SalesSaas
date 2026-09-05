#!/usr/bin/env python3
"""
Orquestador QA chat RLS fix:
  1. Aplica 0088 en staging + smoke E2E (REST + Realtime + no-fuga)
  2. Aplica 0088 en prod (backup) + smoke E2E
  3. Limpia usuarios QA
"""
import argparse
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE_DIR = "/var/www/Saletse"
QA_SCRIPT = "scripts/qa-chat-rls-fix.mjs"
QA_EMAILS = [
    "qa-chat-rls-a@saletse-test.com",
    "qa-chat-rls-b@saletse-test.com",
    "qa-chat-rls-c@saletse-test.com",
]
PERSONAL_NAMES = ["QA Chat A", "QA Chat B", "QA Chat C"]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)

TARGETS = {
    "staging": {
        "db": "supabase-db",
        "env_file": "/opt/saletse-sb-staging/.env",
        "url_keys": ("SUPABASE_PUBLIC_URL", "API_EXTERNAL_URL"),
        "anon_keys": ("ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"),
        "service_keys": ("SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
        "node_cwd": REMOTE_DIR,
    },
    "prod": {
        "db": "saletse-prod-db",
        "env_file": "/var/www/Saletse/.env",
        "url_keys": ("SUPABASE_URL",),
        "anon_keys": ("SUPABASE_ANON_KEY", "ANON_KEY"),
        "service_keys": ("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"),
        "node_cwd": REMOTE_DIR,
    },
}


def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.strip().startswith("#"):
                    k, v = raw.split("=", 1)
                    data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def ssh_connect(env):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("VPS_HOST", "187.77.14.148"),
        username=env.get("VPS_USER", "root"),
        password=env.get("VPS_PASSWORD"),
        timeout=30,
    )
    return client


def run(client, cmd, timeout=300):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    return code, out, err


def fetch_remote_env(client, path):
    _, o, _ = client.exec_command(f"cat {path}", timeout=30)
    data = {}
    for line in o.read().decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def pick(data, keys):
    for k in keys:
        if data.get(k):
            return data[k]
    return None


def psql(client, db, sql):
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = f"echo {b64} | base64 -d | docker exec -i {db} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    code, out, err = run(client, cmd, timeout=120)
    if code != 0 or "ERROR:" in err:
        raise RuntimeError((out + err)[-3000:])
    return out.strip()


def purge_qa_users(client, db):
    quoted = ", ".join(f"'{e}'" for e in QA_EMAILS)
    psql(
        client,
        db,
        f"""
{sql_capture_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)}
DELETE FROM chat_messages WHERE sender_id IN (SELECT id FROM profiles WHERE email IN ({quoted}));
DELETE FROM chat_members WHERE usuario_id IN (SELECT id FROM profiles WHERE email IN ({quoted}));
DELETE FROM chat_conversations WHERE titulo LIKE 'QA-RLS-%';
DELETE FROM workspace_miembros wm USING profiles p
WHERE wm.usuario_id = p.id AND p.email IN ({quoted});
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({quoted});
DELETE FROM auth.users WHERE email IN ({quoted});
DELETE FROM profiles WHERE email IN ({quoted});
""",
    )


def apply_0088_local(target):
    cmd = [sys.executable, str(ROOT / "scripts" / "apply-migration-0088.py"), "--target", target]
    print("$", " ".join(cmd))
    r = subprocess.run(cmd, cwd=str(ROOT))
    if r.returncode != 0:
        sys.exit(r.returncode)


def run_qa_on_vps(client, target):
    cfg = TARGETS[target]
    remote_env = fetch_remote_env(client, cfg["env_file"])
    url = pick(remote_env, cfg["url_keys"])
    anon = pick(remote_env, cfg["anon_keys"])
    service = pick(remote_env, cfg["service_keys"])
    if not url or not anon or not service:
        raise RuntimeError(f"Env incompleto en {cfg['env_file']}")

    sftp = client.open_sftp()
    sftp.put(str(ROOT / QA_SCRIPT), f"{REMOTE_DIR}/qa-chat-rls-fix.mjs")
    sftp.close()

    env_exports = (
        f"export SUPABASE_URL='{url}' SUPABASE_PUBLIC_URL='{url}' "
        f"SUPABASE_ANON_KEY='{anon}' ANON_KEY='{anon}' "
        f"SUPABASE_SERVICE_ROLE_KEY='{service}' SERVICE_ROLE_KEY='{service}' "
        f"QA_CHAT_TARGET='{target}' QA_CHAT_RESULTS='.qa-chat-rls-{target}.json'; "
    )
    cmd = (
        f"cd {cfg['node_cwd']} && {env_exports} "
        f"node qa-chat-rls-fix.mjs 2>&1"
    )
    code, out, err = run(client, cmd, timeout=300)
    print(out)
    if err.strip():
        print(err, file=sys.stderr)

    _, res_out, _ = run(client, f"cat {cfg['node_cwd']}/.qa-chat-rls-{target}.json 2>/dev/null || true", timeout=30)
    raw = res_out.strip()
    summary = None
    if raw:
        summary = json.loads(raw)
        print(f"\n=== QA {target.upper()} ===")
        for r in summary.get("results", []):
            print(f"{r['ok']}  {r['id']}: {r['obs']}")
        if not summary.get("all_pass"):
            code = 1
    if code != 0:
        raise RuntimeError(f"QA chat {target} falló (exit {code})")
    return summary or {"all_pass": code == 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--steps",
        default="staging-qa,prod-apply,prod-qa",
        help="staging-apply,staging-qa,prod-apply,prod-qa (comma-separated)",
    )
    args = parser.parse_args()
    steps = [s.strip() for s in args.steps.split(",") if s.strip()]

    env = load_env()
    if not env.get("VPS_PASSWORD"):
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = ssh_connect(env)
    summaries = {}

    try:
        if "staging-apply" in steps:
            apply_0088_local("staging")

        if "staging-qa" in steps:
            print("\n=== STAGING QA ===")
            summaries["staging"] = run_qa_on_vps(client, "staging")
            purge_qa_users(client, TARGETS["staging"]["db"])
            left = psql(client, TARGETS["staging"]["db"], f"SELECT COUNT(*) FROM profiles WHERE email IN ({', '.join(repr(e) for e in QA_EMAILS)});")
            left_ws = psql(client, TARGETS["staging"]["db"], sql_leftover_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)).strip().split("|")[-1].strip()
            print(f"Staging QA users restantes: {left} ws_personal={left_ws}")

        if "prod-apply" in steps:
            apply_0088_local("prod")

        if "prod-qa" in steps:
            print("\n=== PROD QA ===")
            summaries["prod"] = run_qa_on_vps(client, "prod")
            purge_qa_users(client, TARGETS["prod"]["db"])
            left = psql(client, TARGETS["prod"]["db"], f"SELECT COUNT(*) FROM profiles WHERE email IN ({', '.join(repr(e) for e in QA_EMAILS)});")
            left_ws = psql(client, TARGETS["prod"]["db"], sql_leftover_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)).strip().split("|")[-1].strip()
            print(f"Prod QA users restantes: {left} ws_personal={left_ws}")
    finally:
        client.close()

    print("\n=== RESUMEN FINAL ===")
    for k, v in summaries.items():
        ok = v.get("all_pass", False)
        print(f"{k}: {'PASS' if ok else 'FAIL'}")
    if summaries and not all(v.get("all_pass") for v in summaries.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
