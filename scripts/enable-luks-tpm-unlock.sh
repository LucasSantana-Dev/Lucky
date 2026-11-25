#!/usr/bin/env bash
# Switches the prod host from manual unlock (option A) to TPM2 auto-unlock
# (option C) of the LUKS container behind /var/lib/docker.
# Step 5, option C of docs/runbooks/encryption-at-rest.md.
# Run ON the prod host, interactively (systemd-cryptenroll asks for the current passphrase):
#   scp scripts/enable-luks-tpm-unlock.sh luk-server@server-do-luk:/tmp/ && ssh -t luk-server@server-do-luk bash /tmp/enable-luks-tpm-unlock.sh
# No downtime: the running stack is not touched. The reboot test is left manual on purpose.
set -euo pipefail

IMG=/srv/docker-crypt.img
NAME=dockercrypt
MNT=/var/lib/docker
CRYPTTAB_LINE="$NAME $IMG none luks,tpm2-device=auto,nofail"
FSTAB_LINE="/dev/mapper/$NAME $MNT ext4 defaults,nofail,x-systemd.requires=systemd-cryptsetup@$NAME.service 0 2"
STAMP=$(date +%F-%H%M%S)

die() {
    echo "ABORT: $*" >&2
    exit 1
}

echo ">> pre-checks"
[ -f "$IMG" ] || die "$IMG not found (was encrypt-docker-at-rest.sh run?)."
[ "$(findmnt -no SOURCE "$MNT" || true)" = "/dev/mapper/$NAME" ] ||
    die "$MNT is not mounted from /dev/mapper/$NAME. Unlock it first (option A line in the runbook)."
[ -e /dev/tpmrm0 ] || die "no /dev/tpmrm0: this host has no usable TPM. Enable fTPM/PTT in the BIOS, or use option B (USB keyfile)."
[ "$(cat /sys/class/tpm/tpm0/tpm_version_major 2>/dev/null || true)" = "2" ] || die "TPM is not version 2.0."
SYSTEMD_VER=$(systemctl --version | awk 'NR==1 {print $2}')
[ "${SYSTEMD_VER%%.*}" -ge 251 ] 2>/dev/null ||
    die "systemd $SYSTEMD_VER is too old: TPM2 unlock of a file-backed crypttab entry needs 251 or newer."
LOOP=$(sudo losetup -j "$IMG" | cut -d: -f1 | head -1)
[ -n "$LOOP" ] || die "no loop device backs $IMG."
echo "   systemd $SYSTEMD_VER, TPM 2.0 present, $IMG on $LOOP, mounted at $MNT"

sudo apt-get install -y tpm2-tools

echo ">> 1. enroll the TPM2 key (the passphrase keyslot stays as the fallback)"
if sudo cryptsetup luksDump "$LOOP" | grep -q 'systemd-tpm2'; then
    echo "   already enrolled, skipping"
else
    # PCR 7 = Secure Boot policy. A firmware or Secure Boot change makes the TPM
    # refuse the key: the boot then waits for the passphrase on the console
    # (or stays down with nofail), and re-running this script re-enrolls.
    echo "   type the CURRENT LUKS passphrase when asked"
    sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7 "$LOOP"
fi
sudo cryptsetup luksDump "$LOOP" | grep -q 'systemd-tpm2' || die "TPM2 token not found after enrollment."

echo ">> 2. /etc/crypttab"
if grep -qE "^$NAME[[:space:]]" /etc/crypttab; then
    echo "   entry exists, leaving it: $(grep -E "^$NAME[[:space:]]" /etc/crypttab)"
else
    sudo cp /etc/crypttab "/etc/crypttab.bak-$STAMP"
    echo "$CRYPTTAB_LINE" | sudo tee -a /etc/crypttab >/dev/null
fi

echo ">> 3. /etc/fstab"
if grep -qE "^/dev/mapper/$NAME[[:space:]]" /etc/fstab; then
    echo "   entry exists, leaving it: $(grep -E "^/dev/mapper/$NAME[[:space:]]" /etc/fstab)"
else
    sudo cp /etc/fstab "/etc/fstab.bak-$STAMP"
    echo "$FSTAB_LINE" | sudo tee -a /etc/fstab >/dev/null
fi
sudo findmnt --verify --tab-file /etc/fstab >/dev/null || die "findmnt --verify rejects /etc/fstab. Restore /etc/fstab.bak-$STAMP."

echo ">> 4. Docker waits for the mount, never starts on an empty $MNT"
for unit in docker.service containerd.service; do
    sudo mkdir -p "/etc/systemd/system/$unit.d"
    printf '[Unit]\nRequiresMountsFor=%s\n' "$MNT" | sudo tee "/etc/systemd/system/$unit.d/luks.conf" >/dev/null
done
sudo systemctl daemon-reload
sudo systemd-analyze verify docker.service >/dev/null 2>&1 || echo "   (systemd-analyze printed warnings for docker.service, check them)"

echo ">> 5. enable Docker at boot"
sudo systemctl enable containerd.service docker.service docker.socket

echo ">> 6. lukbot.service (#3237)"
# Containers come back through their restart policy once dockerd starts. The unit's
# bare 'docker compose up -d' has no IMAGE_TAG and compose refuses it (#3107), so it
# can only fail. Disable it rather than keep a unit that cannot work.
if systemctl is-enabled lukbot.service >/dev/null 2>&1; then
    sudo systemctl disable lukbot.service
    echo "   disabled (restart policies bring the stack back)"
fi

echo ">> checks"
sudo cryptsetup luksDump "$LOOP" | grep -E 'systemd-tpm2|tpm2-pcrs' || true
grep -E "^$NAME[[:space:]]" /etc/crypttab
grep -E "^/dev/mapper/$NAME[[:space:]]" /etc/fstab
systemctl is-enabled docker.service containerd.service || true
NO_RESTART=$(docker ps --format '{{.Names}}' | while read -r c; do
    p=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$c")
    case "$p" in always | unless-stopped) ;; *) echo "$c($p)" ;; esac
done)
if [ -n "$NO_RESTART" ]; then
    echo "!! running containers without a restart policy, they will NOT come back after a reboot: $NO_RESTART"
fi

echo ">> done. Test with a real reboot in a window with nobody listening:"
echo "sudo reboot"
echo "then: findmnt $MNT (source /dev/mapper/$NAME), docker ps, docker inspect lucky-bot --format '{{.Config.Image}}'"
echo "If the boot does not unlock, the passphrase still works: the option A line in the runbook."
