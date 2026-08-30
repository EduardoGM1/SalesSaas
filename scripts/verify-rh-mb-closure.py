#!/usr/bin/env python3
import base64, paramiko
from pathlib import Path
env = {k.strip(): v.strip().strip('"') for k,v in [l.split('=',1) for l in Path(r"c:/dev/SalesApp/sales-app/.env.local").read_text().splitlines() if '=' in l and not l.strip().startswith('#')]}
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env["VPS_HOST"], username="root", password=env["VPS_PASSWORD"], timeout=25, allow_agent=False, look_for_keys=False)
def run(sql):
    b64 = base64.b64encode(sql.encode()).decode()
    _, o, _ = c.exec_command(f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -t -A", timeout=60)
    return o.read().decode().strip()
print("test profiles:", run("SELECT COUNT(*) FROM profiles WHERE email LIKE 'qa-rh-mb-%@saletse-test.com';"))
print("test auth:", run("SELECT COUNT(*) FROM auth.users WHERE email LIKE 'qa-rh-mb-%@saletse-test.com';"))
print("grep:", end=" ")
_, o, _ = c.exec_command("grep -l 'worksheet.royal_holiday.money_box' /var/www/Saletse/apps/web/dist/assets/*.js | wc -l", timeout=20)
print(o.read().decode().strip())
c.close()
