# Lucky Current State (2026-03-10)

## Version / Branch
- Version: `2.6.6`
- Branch: `main`
- Last commit: `ccc2b49 fix(deploy): align webhook working directory with homelab stack (#143)`

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

## Runtime Verification
- ✅ OAuth smoke check:
  - `GET https://lucky.lucassantana.tech/api/auth/discord` returns `302`
  - `redirect_uri` now points to `https://lucky.lucassantana.tech/api/auth/callback`
  - `Set-Cookie` includes `Secure; SameSite=Lax`
- ✅ Homelab webhook now runs with `command-working-directory=/home/luk-server/Lucky`
- ✅ Manual compose execution from webhook container now targets existing `lucky` stack without container-name conflicts

## Known Operational Gap
- Deploy GitHub workflow still treats webhook HTTP `200` as success even if inner deploy script later fails or stalls.
- GHCR pull intermittently times out (notably `lucky-nginx`), causing fallback `docker compose build` and long-running deploy executions.
