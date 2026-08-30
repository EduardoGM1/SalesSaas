#!/usr/bin/env python3
"""Aplica 0089 harden chat member helper en staging + prod."""
import sys
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations" / "0089_harden_chat_member_rls_helper.sql"

def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.strip().startswith("#"):
                    k, v = raw.split("=", 1)
                    data[k.strip()] = v.strip().strip('"').strip("'")
    return data

def apply(client, db, label):
    sftp = client.open_sftp()
    sftp.put(str(MIG), "/tmp/0089_harden_chat_member_rls_helper.sql")
    sftp.close()
    cmd = f"docker exec -i {db} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/0089_harden_chat_member_rls_helper.sql"
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode()
    err = e.read().decode()
    code = o.channel.recv_exit_status()
    print(f"=== {label} exit {code} ===")
    print(out)
    if err.strip(): print(err, file=sys.stderr)
    if code != 0: sys.exit(code)

env = load_env()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env["VPS_HOST"], username="root", password=env["VPS_PASSWORD"], timeout=30)
for db, label in [("supabase-db", "staging"), ("saletse-prod-db", "prod")]:
    apply(c, db, label)
c.close()
print("OK")
