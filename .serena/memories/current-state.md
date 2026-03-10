# Lucky Current State (2026-03-10)

## Version / Branch
- Version: `2.6.6`
- Branch: `main`
- Last commit: `36937e4 fix(deploy): recover stale webhook deploy lock (#144)`

## Session Delivery (PRs + Release)
- ✅ PR #137 `chore(lint)` merged: frontend ESLint flat-config stabilization + backend lint guardrails + CI lint gate alignment
- ✅ PR #138 `fix(auth)` merged: OAuth redirect precedence fixed to same-origin callback (`session -> WEBAPP_REDIRECT_URI -> forwarded host`)
- ✅ PR #135 `feat(music)` merged: music reliability and recommendation/session improvements
- ✅ PR #139 `chore(release)` merged: release prep for `v2.6.6`
- ✅ Tag/release published: `v2.6.6`
- ✅ Follow-up deploy hardening merged:
  - PR #140 `fix(deploy): pin compose project for webhook rollouts`
  - PR #141 `fix(deploy): resolve compose workdir for webhook runs`
  - PR #142 `fix(deploy): use project-directory for compose identity`
  - PR #143 `fix(deploy): align webhook working directory with homelab stack`
  - PR #144 `fix(deploy): recover stale webhook deploy lock`

## Runtime Verification
- ✅ OAuth smoke check:
  - `GET https://lucky.lucassantana.tech/api/auth/discord` returns `302`
  - `redirect_uri` now points to `https://lucky.lucassantana.tech/api/auth/callback`
  - `Set-Cookie` includes `Secure; SameSite=Lax`
- ✅ Homelab webhook now runs with `command-working-directory=/home/luk-server/Lucky`
- ✅ Webhook container was recreated and now mounts updated `/scripts/deploy.sh` with PID-aware lock recovery (`LOCK_PID_FILE`, `acquire_lock`)
- ✅ Deploy workflow `22915866727` completed and webhook logs confirm real rollout completed:
  - pull images
  - recreate `lucky-frontend`, `lucky-backend`, `lucky-bot`
  - health/status check + image prune
  - `Deploy complete!`

## Known Operational Gap
- Deploy GitHub workflow still treats webhook HTTP `200` as success even if inner deploy script later fails/stalls after the HTTP response.
- GHCR pull intermittently times out (notably `lucky-nginx`), causing fallback `docker compose build` and long-running deploy executions.
- Real-user OAuth browser smoke is still required to close the remaining "landing page loop" report.
