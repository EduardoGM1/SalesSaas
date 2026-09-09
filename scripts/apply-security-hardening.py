#!/usr/bin/env python3
"""Aplica hardening Fases 1-3 en el VPS. Requiere VPS_PASSWORD al menos una vez."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import DEFAULT_KEY, connect_vps, load_env_file  # noqa: E402

REMOTE = "/var/www/Saletse"
PUBLISH_FILES = [
    "apps/api/src/index.js",
    "apps/api/src/app.js",
    "apps/api/src/lib/request-context.js",
    "apps/api/src/lib/logger.js",
    "apps/api/src/lib/supabase-server.js",
    "apps/api/src/lib/workspace-scope.js",
    "apps/api/src/middleware/rate-limit.js",
    "apps/api/src/routes/route-utils.js",
    "apps/api/package.json",
    "deploy/ecosystem.config.cjs",
    "deploy/nginx-saletse.conf",
    "deploy/nginx-saletse-security-headers.conf",
    "deploy/nginx-saletse-ratelimit.conf",
    "supabase/migrations/0092_force_row_level_security.sql",
    "apps/web/index.html",
    "scripts/remote-harden.sh",
    "scripts/fix-pg-hba.py",
]


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600, check: bool = True) -> str:
    print(f"\n$ {cmd[:240]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()

    def emit(text: str, stream=sys.stdout):
        safe = text.encode(stream.encoding or "utf-8", errors="replace").decode(stream.encoding or "utf-8", errors="replace")
        print(safe[:8000], file=stream)

    if out.strip():
        emit(out.rstrip())
    if err.strip():
        emit(err.rstrip(), sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"falló ({code}): {cmd}")
    return out


def ensure_local_key() -> tuple[Path, Path]:
    priv = DEFAULT_KEY
    pub = Path(str(priv) + ".pub")
    if not priv.is_file():
        subprocess.check_call(
            ["ssh-keygen", "-t", "ed25519", "-f", str(priv), "-N", "", "-C", "saletse-hardening"]
        )
    if not pub.is_file():
        with pub.open("w", encoding="utf-8") as fh:
            subprocess.check_call(["ssh-keygen", "-y", "-f", str(priv)], stdout=fh)
    return priv, pub


def remember_key_in_env_local():
    env_path = ROOT / ".env.local"
    marker = "VPS_SSH_KEY="
    line = f"{marker}{DEFAULT_KEY}"
    if env_path.is_file():
        text = env_path.read_text(encoding="utf-8")
        if marker in text:
            return
        env_path.write_text(text.rstrip() + "\n" + line + "\n", encoding="utf-8")
    else:
        env_path.write_text(line + "\n", encoding="utf-8")


def install_pubkey(client, pub_text: str):
    b64 = pub_text.strip().replace("'", "")
    cmd = f"""
set -e
install_key() {{
  local home="$1"
  mkdir -p "$home/.ssh"
  chmod 700 "$home/.ssh"
  touch "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
  grep -Fqx '{b64}' "$home/.ssh/authorized_keys" || echo '{b64}' >> "$home/.ssh/authorized_keys"
}}
install_key /root
if id ubuntu >/dev/null 2>&1; then
  install_key /home/ubuntu
  chown -R ubuntu:ubuntu /home/ubuntu/.ssh
fi
"""
    run(client, cmd)


def write_sshd_hardening(client, disable_password: bool):
    pw = "no" if disable_password else "yes"
    run(
        client,
        f"""
cat >/etc/ssh/sshd_config.d/00-saletse-hardening.conf <<EOF
PermitRootLogin prohibit-password
PasswordAuthentication {pw}
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
# cloud-init suele fijar PasswordAuthentication yes (primero gana).
if [ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]; then
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication {pw}/' /etc/ssh/sshd_config.d/50-cloud-init.conf
fi
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication {pw}/' /etc/ssh/sshd_config || true
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config || true
sshd -t
systemctl reload ssh || systemctl reload sshd
sshd -T | grep -Ei 'permitroot|passwordauth|kbdinteractive|pubkeyauth|maxauth|port '
""",
    )


def put_files(sftp, client):
    for rel in PUBLISH_FILES:
        local = ROOT / rel
        if not local.is_file():
            raise FileNotFoundError(local)
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        run(client, f"mkdir -p $(dirname {remote})")
        sftp.put(str(local), remote)
        print(f"uploaded {rel}")


def inject_csp_dist(client):
    run(
        client,
        r"""
python3 - <<'PY'
from pathlib import Path
p = Path("/var/www/Saletse/apps/web/dist/index.html")
if not p.exists():
    print("NO_DIST")
    raise SystemExit(0)
html = p.read_text(encoding="utf-8")
if "Content-Security-Policy" in html:
    print("CSP_ALREADY")
else:
    needle = '<meta name="theme-color"'
    csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; base-uri \'self\'; form-action \'self\'; frame-ancestors \'none\'; script-src \'self\' \'unsafe-inline\' https://cdn.onesignal.com; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com data:; img-src \'self\' data: blob: https:; connect-src \'self\' https://cdn.onesignal.com https://onesignal.com wss: https:; worker-src \'self\'; media-src \'self\' blob:;" />\n    '
    if needle in html:
        html = html.replace(needle, csp + needle, 1)
        p.write_text(html, encoding="utf-8")
        print("CSP_INJECTED")
    else:
        print("NO_NEEDLE")
PY
""",
    )


def main():
    env = load_env_file(ROOT)
    priv, pub = ensure_local_key()
    remember_key_in_env_local()
    env["VPS_SSH_KEY"] = str(priv)
    resume = "--resume" in sys.argv

    if not resume:
        pub_text = pub.read_text(encoding="utf-8").strip()
        print("== Conectando (password o clave) ==")
        client = connect_vps(env)
        install_pubkey(client, pub_text)
        write_sshd_hardening(client, disable_password=False)
        print("== Verificando login por clave ==")
        key_client = paramiko.SSHClient()
        key_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        key_client.connect(
            env.get("VPS_HOST", "187.77.14.148"),
            username=env.get("VPS_USER", "root"),
            key_filename=str(priv),
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )
        run(key_client, "echo KEY_LOGIN_OK && hostname")
        key_client.close()
        print("== Desactivando password SSH ==")
        write_sshd_hardening(client, disable_password=True)
        client.close()

    print("== Reconectando solo con clave ==")
    client = connect_vps({**env, "VPS_PASSWORD": ""})
    run(client, "echo KEY_ONLY_OK && sshd -T | grep -Ei 'permitroot|passwordauth|maxauth'")

    sftp = client.open_sftp()
    put_files(sftp, client)
    sftp.put(str(ROOT / "scripts" / "remote-harden.sh"), "/tmp/remote-harden.sh")
    sftp.put(str(ROOT / "scripts" / "fix-pg-hba.py"), "/tmp/fix-pg-hba.py")
    sftp.close()
    run(client, "chmod +x /tmp/remote-harden.sh")

    for phase in ("fail2ban", "sysctl", "perms", "port3000", "unattended", "apparmor", "tmp", "logrotate", "backup"):
        print(f"\n######## {phase} ########")
        run(client, f"bash /tmp/remote-harden.sh {phase}", timeout=900)

    print("\n######## nginx + API_HOST + helmet ########")
    run(
        client,
        f"""
set -e
cp {REMOTE}/deploy/nginx-saletse-security-headers.conf /etc/nginx/snippets/saletse-security-headers.conf
cp {REMOTE}/deploy/nginx-saletse-ratelimit.conf /etc/nginx/conf.d/saletse-ratelimit.conf
cp {REMOTE}/deploy/nginx-saletse.conf /etc/nginx/sites-enabled/saletse
grep -q '^API_HOST=' {REMOTE}/.env && sed -i 's/^API_HOST=.*/API_HOST=127.0.0.1/' {REMOTE}/.env || echo 'API_HOST=127.0.0.1' >> {REMOTE}/.env
cd {REMOTE} && npm install -w @salesapp/api helmet@^7.2.0 --omit=dev
pm2 restart saletse-api --update-env || pm2 start {REMOTE}/deploy/ecosystem.config.cjs
pm2 restart saletse-api-staging --update-env || true
nginx -t
systemctl reload nginx
""",
        timeout=300,
    )
    inject_csp_dist(client)

    print("\n######## FORCE RLS + pg_hba ########")
    run(
        client,
        f"""
set -e
docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < {REMOTE}/supabase/migrations/0092_force_row_level_security.sql
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < {REMOTE}/supabase/migrations/0092_force_row_level_security.sql || true
edit_hba() {{
  local ctn=$1
  local hba
  hba=$(docker exec "$ctn" psql -U supabase_admin -d postgres -tA -c "SHOW hba_file;")
  docker cp "$ctn:$hba" /tmp/pg_hba_$ctn.conf
  python3 /tmp/fix-pg-hba.py /tmp/pg_hba_$ctn.conf
  docker cp /tmp/pg_hba_$ctn.conf "$ctn:$hba"
  docker exec "$ctn" psql -U supabase_admin -d postgres -c "ALTER SYSTEM SET log_connections = on;"
  docker exec "$ctn" psql -U supabase_admin -d postgres -c "ALTER SYSTEM SET log_disconnections = on;"
  docker exec "$ctn" psql -U supabase_admin -d postgres -c "SELECT pg_reload_conf();"
}}
edit_hba saletse-prod-db
edit_hba supabase-db || true
""",
        timeout=180,
    )

    print("\n######## JWT 15m (si hay .env compose) ########")
    run(client, "bash /tmp/remote-harden.sh jwt", timeout=120, check=False)

    print("\n######## backup + restore drill ########")
    run(client, "bash /tmp/remote-harden.sh backup", timeout=120)
    run(client, "bash /tmp/remote-harden.sh restore-drill", timeout=300)

    print("\n######## UFW (SSH clave ya verificado) ########")
    run(client, "bash /tmp/remote-harden.sh ufw", timeout=120)

    print("\n######## verificación ########")
    run(
        client,
        """
set +e
echo '--- listen ---'
ss -tlnp | grep -E ':22|:80|:443|:3000|:4000|:4001|:5432|:5433' || true
echo '--- sshd ---'
sshd -T | grep -Ei 'permitroot|passwordauth|maxauth|pubkey'
echo '--- fail2ban ---'
systemctl is-active fail2ban
echo '--- ufw ---'
ufw status | head -20
echo '--- api health ---'
curl -sf http://127.0.0.1:4000/health
echo
curl -sI http://127.0.0.1/ | head -25
echo '--- rls forced ---'
docker exec saletse-prod-db psql -U supabase_admin -d postgres -tA -c "select count(*) filter (where c.relrowsecurity) enabled, count(*) filter (where c.relforcerowsecurity) forced from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"
""",
        timeout=60,
        check=False,
    )

    print("\n======== HARDENING APLICADO ========")
    print("SSH: clave en", priv)
    print("PasswordAuthentication=no. Usa scripts/vps_ssh.py (VPS_SSH_KEY).")
    client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("ERROR:", exc, file=sys.stderr)
        sys.exit(1)
