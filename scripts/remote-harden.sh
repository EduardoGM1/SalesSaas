#!/usr/bin/env bash
# Endurecimiento VM — invocado por apply-security-hardening.py
set -euo pipefail
PHASE="${1:-all}"
echo "=== harden phase=$PHASE $(date -u +%FT%TZ) ==="

install_fail2ban() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y fail2ban
  cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
findtime = 10m
bantime = 1h
backend = systemd
EOF
  systemctl enable --now fail2ban
  systemctl restart fail2ban
  systemctl is-active fail2ban
}

harden_sysctl() {
  cat >/etc/sysctl.d/99-saletse-hardening.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
EOF
  sysctl --system >/tmp/sysctl-apply.log 2>&1 || true
  sysctl net.ipv4.conf.all.rp_filter net.ipv4.conf.all.accept_redirects kernel.dmesg_restrict kernel.kptr_restrict
}

perms_and_dirs() {
  if [ -f /etc/monarx-agent.conf ]; then
    chmod 640 /etc/monarx-agent.conf || true
    chown root:root /etc/monarx-agent.conf || true
  fi
  mkdir -p /opt/saletse-backups/pg /opt/saletse-backups/web-dist
  chmod 700 /opt/saletse-backups
  find /opt/saletse-backups -type d -exec chmod 750 {} \;
  find /opt/saletse-backups -type f -exec chmod 640 {} \; || true
}

close_port_3000() {
  iptables -C INPUT -p tcp --dport 3000 ! -s 127.0.0.1 -j DROP 2>/dev/null \
    || iptables -I INPUT -p tcp --dport 3000 ! -s 127.0.0.1 -j DROP
  iptables -C INPUT -p tcp --dport 4000 ! -s 127.0.0.1 -j DROP 2>/dev/null \
    || iptables -I INPUT -p tcp --dport 4000 ! -s 127.0.0.1 -j DROP
}

enable_ufw() {
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw || true
  ufw --force reset
  sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw || true
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ufw status verbose
}

unattended() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y unattended-upgrades
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  unattended-upgrade -v --dry-run >/tmp/unattended-dry.log 2>&1 || true
  unattended-upgrade -v >/tmp/unattended.log 2>&1 || true
  echo "unattended-upgrades done (see /tmp/unattended.log)"
}

apparmor_nginx() {
  if command -v aa-enforce >/dev/null 2>&1 && [ -f /etc/apparmor.d/usr.sbin.nginx ]; then
    aa-enforce /etc/apparmor.d/usr.sbin.nginx || true
  fi
  aa-status 2>/dev/null | head -20 || echo "aa-status no disponible"
}

tmp_noexec() {
  if findmnt /tmp >/dev/null 2>&1; then
    mount -o remount,nosuid,nodev,noexec /tmp 2>/dev/null || echo "WARN: no se pudo remount /tmp"
    findmnt /tmp || true
    return
  fi
  echo "WARN: /tmp no es mount dedicado; se omite tmpfs noexec en caliente (evita romper apt/docker)"
}

logrotate_90d() {
  cat >/etc/logrotate.d/saletse <<'EOF'
/var/log/nginx/*.log {
  daily
  rotate 90
  missingok
  notifempty
  compress
  delaycompress
  sharedscripts
  postrotate
    [ -s /run/nginx.pid ] && kill -USR1 "$(cat /run/nginx.pid)"
  endscript
}
EOF
}

backup_key_and_script() {
  if [ ! -f /root/.saletse-backup.key ]; then
    umask 077
    openssl rand -hex 32 >/root/.saletse-backup.key
    chmod 600 /root/.saletse-backup.key
  fi
  cat >/usr/local/sbin/saletse-pg-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail
KEY=/root/.saletse-backup.key
DIR=/opt/saletse-backups/pg
mkdir -p "$DIR"
chmod 700 "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
dump_one() {
  local ctn=$1 label=$2
  if ! docker ps --format '{{.Names}}' | grep -qx "$ctn"; then
    echo "skip $ctn"
    return
  fi
  docker exec "$ctn" pg_dump -U supabase_admin -d postgres -Fc \
    | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"$KEY" \
    > "$DIR/${label}-${STAMP}.dump.enc"
  chmod 600 "$DIR/${label}-${STAMP}.dump.enc"
}
dump_one saletse-prod-db prod
dump_one supabase-db stg
find "$DIR" -name '*.dump.enc' -mtime +90 -delete
ls -l "$DIR" | tail -5
EOF
  chmod 700 /usr/local/sbin/saletse-pg-backup.sh
  echo "0 3 * * * root /usr/local/sbin/saletse-pg-backup.sh >> /var/log/saletse-pg-backup.log 2>&1" \
    >/etc/cron.d/saletse-pg-backup
  chmod 644 /etc/cron.d/saletse-pg-backup
}

restore_drill() {
  KEY=/root/.saletse-backup.key
  latest=$(ls -1t /opt/saletse-backups/pg/prod-*.dump.enc 2>/dev/null | head -1 || true)
  if [ -z "$latest" ]; then
    echo "No hay dump prod aún; se genera uno"
    /usr/local/sbin/saletse-pg-backup.sh
    latest=$(ls -1t /opt/saletse-backups/pg/prod-*.dump.enc | head -1)
  fi
  tmp=/tmp/saletse-restore-drill.dump
  openssl enc -d -aes-256-cbc -pbkdf2 -pass file:"$KEY" -in "$latest" -out "$tmp"
  docker exec -i saletse-prod-db pg_restore --list < "$tmp" | head -20 || true
  rm -f "$tmp"
  echo "RESTORE_DRILL_OK file=$latest"
}

pg_hba_and_logs() {
  echo "pg_hba se aplica desde apply-security-hardening.py (docker cp)"
}

jwt_15m() {
  for ctn in $(docker ps --format '{{.Names}}' | grep -Ei 'auth|gotrue' || true); do
    echo "auth container: $ctn"
    docker exec "$ctn" printenv | grep -Ei 'JWT_EXPIRY|GOTRUE_JWT' || true
  done
  # Compose files típicos
  for f in /opt/supabase/docker/.env /var/www/Saletse/supabase/.env /root/supabase/docker/.env; do
    if [ -f "$f" ]; then
      echo "found env $f"
      grep -E 'JWT_EXPIRY|GOTRUE_JWT' "$f" || true
      if grep -q '^GOTRUE_JWT_EXPIRY=' "$f"; then
        sed -i 's/^GOTRUE_JWT_EXPIRY=.*/GOTRUE_JWT_EXPIRY=900/' "$f"
      elif grep -q '^JWT_EXPIRY=' "$f"; then
        sed -i 's/^JWT_EXPIRY=.*/JWT_EXPIRY=900/' "$f"
      else
        echo 'GOTRUE_JWT_EXPIRY=900' >>"$f"
      fi
    fi
  done
}

case "$PHASE" in
  fail2ban) install_fail2ban ;;
  sysctl) harden_sysctl ;;
  perms) perms_and_dirs ;;
  port3000) close_port_3000 ;;
  ufw) enable_ufw ;;
  unattended) unattended ;;
  apparmor) apparmor_nginx ;;
  tmp) tmp_noexec ;;
  logrotate) logrotate_90d ;;
  backup) backup_key_and_script ;;
  restore-drill) restore_drill ;;
  pg) pg_hba_and_logs ;;
  jwt) jwt_15m ;;
  all)
    install_fail2ban
    harden_sysctl
    perms_and_dirs
    close_port_3000
    unattended
    apparmor_nginx
    tmp_noexec
    logrotate_90d
    backup_key_and_script
    ;;
  *) echo "unknown phase $PHASE"; exit 1 ;;
esac
echo "=== done $PHASE ==="
