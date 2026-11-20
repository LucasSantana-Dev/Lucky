# Runbook: encrypt production data at rest (LUKS)

Put everything Docker stores on the homelab (Postgres, Redis, Prometheus, Grafana,
Alertmanager volumes, images and container logs) on a LUKS-encrypted filesystem
mounted at `/var/lib/docker`.

Why: Discord's privileged-intent review (required once Lucky passed 10,000 users)
asks whether stored API data is "encrypted at rest, as required by our developer
policy". Before this runbook the `postgres_data` and `redis_data` volumes sat on an
unencrypted disk. See issue #2376 for the related privacy-policy gaps.

Approach: a LUKS **file container** mounted **at** `/var/lib/docker`. Docker keeps its
default `data-root`, so `docker-compose.yml` does not change (cAdvisor's
`/var/lib/docker:/var/lib/docker:ro` mount keeps working). No repartitioning.

Expected downtime: the whole stack is down for the copy (minutes, depending on
`/var/lib/docker` size). Do it in a low-traffic window.

All commands run on the prod host as `luk-server`, in `/home/luk-server/Lucky`,
shell zsh.

## 0. Pre-checks

Check the disk is not already encrypted. If `crypto_LUKS` sits under the
filesystem that holds `/var/lib/docker`, you are already compliant: stop here.

```bash
lsblk -f
```

```bash
findmnt -T /var/lib/docker
```

Size what has to move and check free space. The container needs the used size plus
headroom (at least 50% more), and the copy needs that much free space on the host
disk while both copies exist.

```bash
sudo du -sh /var/lib/docker && df -h /srv
```

Optionally shrink first (removes unused images and build cache only, never volumes):

```bash
docker image prune -a -f && docker builder prune -f
```

Record the running image tag so the stack comes back on the same code (never a
bare `docker compose up`: compose defaults to a stale `:latest`):

```bash
cat .deploy-last-good-sha && docker inspect lucky-bot --format '{{.Config.Image}}'
```

```bash
sudo apt-get install -y cryptsetup rsync
```

## 1. Backup (do not skip)

Logical dump of the database, kept outside `/var/lib/docker`. It contains user
data: keep it out of the repo, encrypt it if it leaves the host, delete it when the
migration is verified.

(zsh: `pipefail` makes a failed `pg_dumpall` fail the line instead of leaving a
partial dump; the subshell keeps `umask 077` and `pipefail` out of your shell.)

```bash
(umask 077; setopt pipefail; docker exec lucky-postgres pg_dumpall -U discordbot | gzip > ~/lucky-pre-luks-$(date +%F).sql.gz) && ls -lh ~/lucky-pre-luks-*.sql.gz
```

## 2. Create and open the encrypted container

Pick the size from step 0 (example 60G). `luksFormat` asks for a passphrase:
store it in your password manager. Losing it means losing the data.

```bash
sudo fallocate -l 60G /srv/docker-crypt.img && sudo chmod 600 /srv/docker-crypt.img
```

```bash
sudo cryptsetup luksFormat --type luks2 /srv/docker-crypt.img
```

```bash
sudo cryptsetup open /srv/docker-crypt.img dockercrypt && sudo mkfs.ext4 -L dockercrypt /dev/mapper/dockercrypt
```

## 3. Stop everything and move the data

```bash
docker compose down
```

Mask the units first, then stop them, and keep them masked until the copy is done.
Without the mask, any `docker` command (another shell, a deploy) re-activates
dockerd through `docker.socket`, and it writes into the half-copied target. Masking
before stopping leaves no window for that. `--runtime` keeps the mask in `/run`, so
a reboot clears it.

```bash
sudo systemctl mask --runtime docker.socket docker.service containerd.service && sudo systemctl stop docker.socket docker.service containerd.service
```

```bash
sudo mv /var/lib/docker /var/lib/docker.plain && sudo mkdir /var/lib/docker && sudo mount /dev/mapper/dockercrypt /var/lib/docker
```

```bash
sudo rsync -aHAXS --numeric-ids /var/lib/docker.plain/ /var/lib/docker/
```

## 4. Start and verify

```bash
sudo systemctl unmask --runtime docker.socket docker.service containerd.service && sudo systemctl start containerd.service docker.service
```

```bash
IMAGE_TAG=$(cut -c1-7 .deploy-last-good-sha) docker compose up -d
```

```bash
cd ~/homelab && docker compose up -d alertmanager prometheus grafana node-exporter cadvisor loki promtail blackbox-exporter && cd ~/Lucky
```

Checks, all must pass:

```bash
findmnt /var/lib/docker
```

(source must be `/dev/mapper/dockercrypt`)

```bash
docker inspect lucky-bot --format '{{.Config.Image}}'
```

(must show the SHA tag from step 0, not `:latest`)

```bash
docker exec lucky-postgres psql -U discordbot -d discordbot -c 'select count(*) from guilds;'
```

(count must match what the bot is in, about 67)

Then in Discord: run a slash command, play a track, open the dashboard. Watch
`docker logs -f lucky-bot` for a few minutes.

## 5. Unlock on reboot

Without this step the next reboot leaves `/var/lib/docker` empty and Docker would
start on a fresh, empty directory. Pick ONE option.

### Option A: manual unlock (most secure, needs you after every reboot)

Docker must not start before the unlock. Disable its autostart:

```bash
sudo systemctl disable docker.service docker.socket containerd.service
```

After each reboot, SSH in and run:

```bash
sudo cryptsetup open /srv/docker-crypt.img dockercrypt && sudo mount /dev/mapper/dockercrypt /var/lib/docker && sudo systemctl start containerd docker && cd ~/Lucky && IMAGE_TAG=$(cut -c1-7 .deploy-last-good-sha) docker compose up -d && cd ~/homelab && docker compose up -d alertmanager prometheus grafana node-exporter cadvisor loki promtail blackbox-exporter
```

The last part starts the homelab monitoring stack (Prometheus, Grafana, Alertmanager,
Loki). It is a separate compose project, so nothing else brings it back: after the
2026-11-16 migration it stayed down for four days with no alert (#3153). It runs after
Lucky because its Prometheus joins the `lucky-monitoring` network Lucky creates. Check it
with `docker ps --format '{{.Names}}' | grep -E '^(prometheus|grafana|alertmanager)$'`
(three lines).

Trade-off: the bot stays offline after a power cut until you do this.

### Option B: keyfile on a USB stick (unattended boot)

The key lives on removable media, so a stolen disk alone cannot be read. Never put
the keyfile on the same disk as the container: that makes the encryption useless.

Plug a USB stick with an ext4 filesystem labelled `LUCKYKEY`, then:

```bash
sudo mkdir -p /mnt/luckykey && sudo mount LABEL=LUCKYKEY /mnt/luckykey && sudo dd if=/dev/urandom of=/mnt/luckykey/docker.key bs=512 count=8 && sudo chmod 400 /mnt/luckykey/docker.key
```

```bash
sudo cryptsetup luksAddKey /srv/docker-crypt.img /mnt/luckykey/docker.key
```

Add to `/etc/crypttab` (keyfile read from the USB device by label):

```
dockercrypt /srv/docker-crypt.img /docker.key:LABEL=LUCKYKEY luks,nofail
```

Add to `/etc/fstab`:

```
/dev/mapper/dockercrypt /var/lib/docker ext4 defaults,nofail,x-systemd.requires=systemd-cryptsetup@dockercrypt.service 0 2
```

Make Docker wait for the mount, so it never starts on an empty directory:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d && printf '[Unit]\nRequiresMountsFor=/var/lib/docker\n' | sudo tee /etc/systemd/system/docker.service.d/luks.conf && sudo systemctl daemon-reload
```

Test it with a real reboot, then repeat the checks from step 4:

```bash
sudo reboot
```

Keep a copy of the keyfile somewhere safe (password manager attachment). The
passphrase from step 2 still works as a fallback.

## 6. Clean up (only after a day of normal operation)

The old plaintext copy still holds all the data. Remove it, and the dump from step 1:

```bash
sudo rm -rf /var/lib/docker.plain && shred -u ~/lucky-pre-luks-*.sql.gz && sudo fstrim -v /
```

Deleting does not erase the blocks. On the prod SSD, `shred` cannot guarantee an
overwrite either (wear levelling remaps writes). `fstrim` tells the SSD to discard
the freed blocks, which on most drives makes them read back as zeros, but it is not
a guaranteed secure erase. The only full guarantee for data that once sat on this
disk in plaintext is full-disk encryption of the host disk, or wiping the disk.

## Rollback

If anything in step 4 fails and you have not run step 6:

```bash
docker compose down; sudo systemctl stop docker.socket docker.service containerd.service; sudo umount /var/lib/docker && sudo rmdir /var/lib/docker && sudo mv /var/lib/docker.plain /var/lib/docker && sudo cryptsetup close dockercrypt && sudo systemctl unmask --runtime docker.socket docker.service containerd.service && sudo systemctl enable --now containerd docker
```

(The unmask covers a failure before step 4 unmasked the units; `enable` undoes the
step 5 option A disable, since the plain directory needs no unlock.)

Then start the stack with `IMAGE_TAG` as in step 4. If the data itself is damaged,
restore the dump from step 1 with `gunzip -c <file> | docker exec -i lucky-postgres psql -U discordbot -d postgres`.

## Not covered

- Bind mounts under the repo checkout (`./secrets`, `./downloads` in
  `docker-compose.yml`) stay on the plain disk. `./secrets` holds credentials, not
  Discord API data. Bot logs use the `bot_logs` named volume, so they live under
  `/var/lib/docker` and are covered.
- Database backups: the homelab cron job `lucky-db-backup`
  (`~/homelab/scripts/maintenance/recover-lucky-db.sh --backup-only`, daily 03:00)
  writes plain `pg_dump` files to `~/homelab/backups/lucky` on the plain disk, with
  no retention. They must be encrypted (for example `age` or `gpg`) or written to an
  encrypted path to count as encrypted at rest.

The Discord intents form asks "Are you encrypting the data that you store at rest".
Answer "Yes" only when every store that holds Discord API data is encrypted: this
runbook through step 6 (the plaintext copy removed), plus the database backups from
the list above.
