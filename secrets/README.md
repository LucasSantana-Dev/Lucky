# secrets/

Bind-mounted read-only into the `bot` container at `/app/secrets` (see
`docker-compose.yml`). Nothing in this directory (other than this file) is
committed — see `.gitignore`.

## youtube-cookies.txt

Fixes #2034: YouTube blocks yt-dlp's cookie-less requests with HTTP 403
(velocity-based bot detection, see `decisions/2026-06-18-youtube-extraction-reliability.md`).
`streamBridge.ts` passes `--cookies <this file>` to yt-dlp when it's present.

To generate it:

1. Log into youtube.com in a browser with an account you're OK using for
   this (a regular account works; doesn't need to be the bot's).
2. Export cookies in Netscape format, e.g. with the "Get cookies.txt LOCALLY"
   browser extension, or `yt-dlp --cookies-from-browser <browser> --cookies youtube-cookies.txt https://youtube.com`
   run locally on a machine with that browser profile.
3. Copy the resulting file to this directory on the homelab host as
   `youtube-cookies.txt`, then restart the `bot` service
   (`docker compose restart bot`) — no rebuild needed.

Cookies expire; if 403s return, re-export and re-copy.
