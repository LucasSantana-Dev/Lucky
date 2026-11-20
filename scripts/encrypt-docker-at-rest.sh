#!/usr/bin/env bash
# Moves /var/lib/docker on the prod host onto a LUKS file container.
# Steps 0-5 (option A, manual unlock) of docs/runbooks/encryption-at-rest.md.
# Run ON the prod host, interactively (luksFormat and sudo prompt):
#   scp scripts/encrypt-docker-at-rest.sh luk-server@server-do-luk:/tmp/ && ssh -t luk-server@server-do-luk bash /tmp/encrypt-docker-at-rest.sh
# Cleanup (step 6: removing /var/lib/docker.plain and the dump) is left manual on purpose.
set -euo pipefail

cd ~/Lucky

if lsblk -no TYPE -s "$(findmnt -no SOURCE -T /var/lib/docker)" | grep -q crypt; then
    echo "Already encrypted, nothing to do."
    exit 0
fi
if [ -e /var/lib/docker.plain ]; then
    echo "ABORT: /var/lib/docker.plain already exists (previous run?)."
    exit 1
fi

TAG=$(cut -c1-7 .deploy-last-good-sha)
# Homelab monitoring services (~/homelab compose/monitoring.yml) restarted after Lucky.
MONITORING="alertmanager prometheus grafana node-exporter cadvisor loki promtail blackbox-exporter"
SZ=$(( $(sudo du -sb /var/lib/docker | cut -f1) * 3 / 2 / 1073741824 + 10 ))G
echo ">> image tag: $TAG  container size: $SZ"

sudo apt-get install -y cryptsetup rsync

DUMP=~/lucky-pre-luks-$(date +%F).sql.gz
# The dump is plaintext user data: create it owner-only.
umask 077
docker exec lucky-postgres pg_dumpall -U discordbot | gzip > "$DUMP"
echo ">> backup: $DUMP ($(du -h "$DUMP" | cut -f1))"

# Create the container while the stack is still up: a lack of disk space fails here, before downtime.
sudo fallocate -l "$SZ" /srv/docker-crypt.img
sudo chmod 600 /srv/docker-crypt.img
echo ">> type YES, then choose the passphrase (save it in your password manager)"
sudo cryptsetup luksFormat --type luks2 /srv/docker-crypt.img
sudo cryptsetup open /srv/docker-crypt.img dockercrypt
sudo mkfs.ext4 -L dockercrypt /dev/mapper/dockercrypt

echo ">> downtime starts"
IMAGE_TAG=$TAG docker compose down
# Option A: Docker must never autostart on an empty, unmounted /var/lib/docker.
# Disable before the move, so a reboot mid-migration cannot start it there.
sudo systemctl disable docker.service docker.socket containerd.service
# Without the mask, any `docker` command (another shell, a deploy) re-activates
# dockerd via docker.socket mid-copy and it writes into the half-copied target.
# Mask before stopping, so nothing can re-activate it in between.
# --runtime: the mask lives in /run and is gone after a reboot.
sudo systemctl mask --runtime docker.socket docker.service containerd.service
trap 'echo "!! failed mid-migration: Docker units are still stopped and masked."; sudo systemctl unmask --runtime docker.socket docker.service containerd.service; echo "!! units unmasked. Follow Rollback in docs/runbooks/encryption-at-rest.md."' ERR
sudo systemctl stop docker.socket docker.service containerd.service
sudo mv /var/lib/docker /var/lib/docker.plain
sudo mkdir /var/lib/docker
sudo mount /dev/mapper/dockercrypt /var/lib/docker
sudo rsync -aHAXS --numeric-ids /var/lib/docker.plain/ /var/lib/docker/
sudo systemctl unmask --runtime docker.socket docker.service containerd.service
trap - ERR
sudo systemctl start containerd.service docker.service
IMAGE_TAG=$TAG docker compose up -d
# The homelab monitoring stack is a separate compose project: nothing else brings it
# back, and on 2026-11-16 it stayed down for four days unnoticed (#3153). After Lucky,
# because its Prometheus joins the lucky-monitoring network Lucky creates.
(cd ~/homelab && docker compose up -d $MONITORING)

sleep 20
echo ">> checks"
findmnt /var/lib/docker
docker inspect lucky-bot --format '{{.Config.Image}}'
docker exec lucky-postgres psql -U discordbot -d discordbot -c 'select count(*) from guilds;'
echo ">> done. After every reboot, unlock with:"
echo "sudo cryptsetup open /srv/docker-crypt.img dockercrypt && sudo mount /dev/mapper/dockercrypt /var/lib/docker && sudo systemctl start containerd docker && cd ~/Lucky && IMAGE_TAG=\$(cut -c1-7 .deploy-last-good-sha) docker compose up -d && cd ~/homelab && docker compose up -d $MONITORING"
