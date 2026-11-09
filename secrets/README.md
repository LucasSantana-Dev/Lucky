# secrets/

Bind-mounted read-write into the `bot` container at `/app/secrets` (see
`docker-compose.yml` — read-write because yt-dlp refreshes the cookie jar
in place on every run, not just reads it). Nothing in this directory
(other than this file) is committed — see `.gitignore`; also excluded from
the Docker build context via `.dockerignore` so it's never sent to the
builder.

## youtube-cookies.txt

Fixes #2034: YouTube blocks yt-dlp's cookie-less requests with HTTP 403
(velocity-based bot detection, see `decisions/2026-06-18-youtube-extraction-reliability.md`).
`streamBridge.ts` passes `--cookies <this file>` to yt-dlp when it's present.

**Treat this file as a credential, not a config file.** It contains active
YouTube session cookies — anyone who gets a copy can act as that account
(watch history, playlists, etc.) until the session expires or is revoked.
Use a dedicated low-value account rather than a personal one. If the file
ever leaks (backup, log capture, compromised host), revoke the session
(sign that account out of all devices in YouTube's account settings) and
re-export.

To generate it:

1. Open a new private/incognito window and log into youtube.com there with
   the dedicated account. In that same tab, open
   `https://www.youtube.com/robots.txt` (the only tab of that window).
2. Export the youtube.com cookies in Netscape format, e.g. with the "Get
   cookies.txt LOCALLY" browser extension (allowed in private windows).
   Then close the private window **without logging out**. YouTube rotates
   the cookies of a session that stays open in a browser, which logs out
   the exported copy within hours; a session that was only ever used for
   the export keeps working (yt-dlp wiki, "Exporting YouTube cookies").
3. Copy the resulting file to this directory on the homelab host as
   `youtube-cookies.txt`. The `bot` container runs as UID 1001 (see
   `Dockerfile`) and needs write access to refresh the cookie jar — a plain
   bind mount does not remap ownership, so if the file isn't already owned
   by UID 1001 on the host, run `chmod o+w youtube-cookies.txt` (or
   `chown 1001 youtube-cookies.txt` if you can) after copying it.
4. Restart the `bot` service (`docker compose restart bot`) — no rebuild
   needed.

Cookies expire; if 403s return, re-export and re-copy. `streamBridge.ts`
logs once — on the first `/play` after restart, not at boot itself, since
the check runs lazily on first use — whether a usable cookies file was
found (`Bridge: yt-dlp cookies file applied`) or not (`Bridge:
YTDLP_COOKIES_FILE is set but not a readable file`). Play something once
after restarting and check the bot's logs to confirm the file was picked
up, rather than assuming 403s mean expired cookies.

The file being readable does not mean the session in it is still logged
in. Cookies are only sent on a retry after YouTube's "Sign in to confirm
you're not a bot" challenge; when that retry gets the same challenge, the
bot logs `Bridge: yt-dlp still got the sign-in check with cookies, re-export
the cookies file` (at most once an hour). That line means the session is
dead: re-export as above. If it keeps appearing right after a fresh export,
YouTube is flagging the host's IP rather than the account.
