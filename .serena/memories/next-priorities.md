# Next Priorities (2026-03-10)

## Completed in This Session
- ✅ Lint stabilization + phased PR rollout completed (`#137`, `#138`, `#135`, `#139`)
- ✅ Release `v2.6.6` tagged and published
- ✅ OAuth callback split-session issue fixed (same-origin callback + secure cookie path)
- ✅ Deploy-webhook auth mismatch fixed (GitHub `DEPLOY_WEBHOOK_SECRET` aligned with homelab runtime)
- ✅ Deploy-webhook compose identity hardening shipped (`#140`, `#141`, `#142`, `#143`)
- ✅ Stale deploy lock recovery shipped (`#144`)
- ✅ Webhook container now executes deploy from `/home/luk-server/Lucky` and mounts updated deploy script
- ✅ Deploy workflow + webhook logs validated as real rollout (not just trigger acceptance)

## Immediate Next
1. **Landing page auth-loop final closure**
   - Run real Discord login smoke and capture browser network evidence:
     - callback request host
     - final `Set-Cookie` for `sessionId`
     - `/api/auth/status` response after callback
   - If loop persists, verify production frontend build/env for `VITE_API_BASE_URL` override drift and purge stale deploy.

2. **Deploy status truthfulness**
   - Make `.github/workflows/deploy.yml` fail when webhook command fails (not only when webhook endpoint returns non-2xx).
   - Add explicit completion signal/check (e.g., deploy status endpoint or webhook command-output verification).

3. **Deploy performance/stability**
   - Investigate intermittent GHCR pull timeouts (`lucky-nginx`) that trigger fallback local builds and long deploy runs.
   - Add bounded timeout/abort behavior for fallback builds in `scripts/deploy.sh`.

4. **Branch hygiene follow-up**
   - Clean any remaining local artifacts from emergency deploy debugging (e.g., untracked `.env.vercel.production`).
