#!/usr/bin/env bash
# First-boot setup for an Ubuntu 22.04 VM that runs Rostify.
#
# Paste this into the instance's "Startup script" field when creating the VM
# (Compute Engine -> Create instance -> Advanced options -> Management ->
# Automation -> Startup script), or run it by hand with sudo.
#
# It is idempotent: running it twice changes nothing. It installs Docker, gives
# the login user access to the daemon, prepares /opt/rostify/secrets and adds a
# 2 GB swap file (the Docker build is the memory peak on a 4 GB VM).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y ca-certificates curl git unzip

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker

# GCP creates the login user from your Google account (not "ubuntu").
LOGIN_USER="${SUDO_USER:-}"
if [ -z "$LOGIN_USER" ] || [ "$LOGIN_USER" = "root" ]; then
  LOGIN_USER="$(getent passwd 1000 | cut -d: -f1 || true)"
fi

if [ -n "${LOGIN_USER:-}" ]; then
  usermod -aG docker "$LOGIN_USER" || true
  install -d -m 700 -o "$LOGIN_USER" -g "$LOGIN_USER" /opt/rostify/secrets
else
  install -d -m 700 /opt/rostify/secrets
fi

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "Rostify host ready. Next: deploy/gcp/README.md steps 3-6."
