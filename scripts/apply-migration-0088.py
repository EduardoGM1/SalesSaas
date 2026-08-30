#!/usr/bin/env python3
"""Aplica migración 0088 fix chat RLS recursion en staging o prod VPS."""
import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations" / "0088_fix_chat_members_rls_recursion.sql"

TARGETS = {
    "staging": {
        "db": "supabase-db",
        "env_file": "/opt/saletse-sb-staging/.env",
        "backup_dir": "/opt/saletse-sb-staging/backups",
    },
    "prod": {
        "db": "saletse-prod-db",
        "env_file": "/var/www/Saletse/.env",
        "backup_dir": "/var/backups/saletse-db",
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
    pwd = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    if not pwd:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("VPS_HOST", "187.77.14.148"),
        username=env.get("VPS_USER", "root"),
        password=pwd,
        timeout=30,
    )
    return client


def run(client, cmd, timeout=180):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    return code, out, err


def backup_policies(client, db, backup_dir):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = f"{backup_dir}/chat_rls_pre_0088_{ts}.sql"
    run(client, f"mkdir -p {backup_dir}", timeout=30)
    sql = (
        "SELECT 'DROP POLICY IF EXISTS \"' || policyname || '\" ON public.' || tablename || ';' "
        "FROM pg_policies WHERE tablename IN ('chat_members','chat_conversations','chat_messages') "
        "ORDER BY tablename, policyname;"
    )
    code, out, err = run(
        client,
        f'docker exec {db} psql -U supabase_admin -d postgres -t -A -c "{sql}"',
        timeout=60,
    )
    if code != 0:
        raise RuntimeError(f"backup list policies failed: {err or out}")
    drops = out.strip()
    backup_body = f"-- backup chat RLS pre-0088 {ts}\n{drops}\n"
    sftp = client.open_sftp()
    remote_tmp = f"/tmp/chat_rls_backup_{ts}.sql"
    with sftp.file(remote_tmp, "w") as f:
        f.write(backup_body)
    sftp.close()
    run(client, f"mv {remote_tmp} {path}", timeout=30)
    return path


def apply_migration(client, db):
    sftp = client.open_sftp()
    sftp.put(str(MIG), "/tmp/0088_fix_chat_members_rls_recursion.sql")
    sftp.close()
    cmd = (
        f"docker exec -i {db} psql -U supabase_admin -d postgres "
        f"-v ON_ERROR_STOP=1 < /tmp/0088_fix_chat_members_rls_recursion.sql"
    )
    code, out, err = run(client, cmd, timeout=120)
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        sys.exit(code)


def verify(client, db):
    checks = [
        (
            "fn user_is_active_chat_member",
            "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='public' AND p.proname='user_is_active_chat_member');",
        ),
        (
            "policy chat_members usa helper",
            "SELECT pg_get_expr(polqual, polrelid) LIKE '%user_is_active_chat_member%' "
            "FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid "
            "WHERE c.relname='chat_members' AND pol.polname='chat_members_select_peer';",
        ),
    ]
    for label, sql in checks:
        code, out, err = run(
            client,
            f'docker exec {db} psql -U supabase_admin -d postgres -t -A -c "{sql}"',
            timeout=30,
        )
        val = (out or err).strip()
        print(f"  {label}: {val}")
        if val not in ("t", "true", "1"):
            raise RuntimeError(f"Verificación falló: {label} = {val}")


def test_no_42p17(client, db):
    sql = (
        "SET LOCAL ROLE authenticated; "
        "SELECT set_config('request.jwt.claim.sub', "
        "(SELECT id::text FROM profiles LIMIT 1), true); "
        "SELECT COUNT(*) FROM chat_messages;"
    )
    code, out, err = run(
        client,
        f'docker exec {db} psql -U supabase_admin -d postgres -c "{sql}" 2>&1',
        timeout=30,
    )
    combined = out + err
    if "42P17" in combined or "infinite recursion" in combined.lower():
        raise RuntimeError(f"Todavía hay 42P17:\n{combined[-500:]}")
    print("  smoke SQL sin 42P17: OK")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("staging", "prod"), required=True)
    parser.add_argument("--skip-backup", action="store_true")
    args = parser.parse_args()

    if not MIG.is_file():
        print(f"No existe {MIG}", file=sys.stderr)
        sys.exit(1)

    cfg = TARGETS[args.target]
    client = ssh_connect(load_env())
    print(f"=== Aplicando 0088 en {args.target} ({cfg['db']}) ===")

    if not args.skip_backup:
        bp = backup_policies(client, cfg["db"], cfg["backup_dir"])
        print(f"Backup policies: {bp}")

    apply_migration(client, cfg["db"])
    verify(client, cfg["db"])
    test_no_42p17(client, cfg["db"])
    client.close()
    print(f"=== {args.target.upper()} OK ===")


if __name__ == "__main__":
    main()
