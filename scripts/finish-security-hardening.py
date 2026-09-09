#!/usr/bin/env python3
"""Cierra UFW, pg_hba IPv6, JWT y verifica."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "harden", ROOT / "scripts" / "apply-security-hardening.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
run = mod.run


def main():
    env = load_env_file(ROOT)
    client = connect_vps({**env, "VPS_PASSWORD": ""})
    sftp = client.open_sftp()
    sftp.put(str(ROOT / "scripts" / "fix-pg-hba.py"), "/tmp/fix-pg-hba.py")
    sftp.put(str(ROOT / "scripts" / "remote-harden.sh"), "/tmp/remote-harden.sh")
    sftp.close()
    run(client, "chmod +x /tmp/remote-harden.sh")

    run(
        client,
        r"""
set -e
edit_hba() {
  local ctn=$1
  local hba
  hba=$(docker exec "$ctn" psql -U supabase_admin -d postgres -tA -c "SHOW hba_file;")
  docker cp "$ctn:$hba" /tmp/pg_hba_$ctn.conf
  python3 /tmp/fix-pg-hba.py /tmp/pg_hba_$ctn.conf
  docker cp /tmp/pg_hba_$ctn.conf "$ctn:$hba"
  docker exec "$ctn" psql -U supabase_admin -d postgres -c "SELECT pg_reload_conf();"
}
edit_hba saletse-prod-db
edit_hba supabase-db || true
echo '--- pg_hba prod hosts ---'
docker exec saletse-prod-db psql -U supabase_admin -d postgres -tA -c "SELECT * FROM pg_hba_file_rules;" | head -30
""",
        timeout=120,
    )

    run(
        client,
        r"""
set +e
echo '--- compose labels ---'
docker inspect saletse-prod-auth --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project.config_files"}} {{index .Config.Labels "com.docker.compose.service"}}'
echo '--- listen api ---'
ss -tlnp | grep -E ':4000|:4001|:3000' || true
echo '--- health ---'
curl -sf http://127.0.0.1:4000/health; echo
curl -sf http://127.0.0.1/health; echo
echo '--- headers ---'
curl -sI http://127.0.0.1/ | head -30
echo '--- rls ---'
docker exec saletse-prod-db psql -U supabase_admin -d postgres -tA -c "select count(*) filter (where c.relrowsecurity) e, count(*) filter (where c.relforcerowsecurity) f from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';"
echo '--- pm2 env API_HOST ---'
pm2 show saletse-api | grep -iE 'API_HOST|status|error' | head -20
""",
        timeout=60,
        check=False,
    )

    print("\n######## JWT recreate auth ########")
    run(
        client,
        r"""
set -e
WD=$(docker inspect saletse-prod-auth --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
CFG=$(docker inspect saletse-prod-auth --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')
SVC=$(docker inspect saletse-prod-auth --format '{{index .Config.Labels "com.docker.compose.service"}}')
echo "WD=$WD CFG=$CFG SVC=$SVC"
if [ -n "$WD" ] && [ -d "$WD" ]; then
  cd "$WD"
  if [ -f .env ]; then
    grep -q '^GOTRUE_JWT_EXPIRY=' .env && sed -i 's/^GOTRUE_JWT_EXPIRY=.*/GOTRUE_JWT_EXPIRY=900/' .env || echo 'GOTRUE_JWT_EXPIRY=900' >> .env
    grep -q '^JWT_EXPIRY=' .env && sed -i 's/^JWT_EXPIRY=.*/JWT_EXPIRY=900/' .env || true
  fi
  # no imprimir secretos
  docker compose -f "${CFG:-docker-compose.yml}" up -d --no-deps --force-recreate "$SVC"
  sleep 4
  docker exec saletse-prod-auth printenv GOTRUE_JWT_EXP || true
else
  echo "NO_COMPOSE_DIR"
fi
""",
        timeout=180,
        check=False,
    )

    print("\n######## UFW ########")
    run(client, "bash /tmp/remote-harden.sh ufw", timeout=120)

    print("\n######## restore-drill ########")
    run(client, "bash /tmp/remote-harden.sh restore-drill", timeout=180, check=False)

    print("\n######## post-ufw health ########")
    run(
        client,
        """
curl -sf http://127.0.0.1:4000/health; echo
curl -sf http://127.0.0.1/health; echo
sshd -T | grep -Ei 'passwordauth|permitroot|maxauth'
ufw status numbered | head -25
ss -tlnp | grep -E ':22|:80|:443|:3000|:4000'
""",
        timeout=30,
        check=False,
    )
    client.close()
    print("FINISH_OK")


if __name__ == "__main__":
    main()
