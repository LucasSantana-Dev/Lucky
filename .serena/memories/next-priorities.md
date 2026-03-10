# Next Priorities (2026-03-10)

## Completed in This Session
- ✅ Lint stabilization + phased PR rollout completed (`#137`, `#138`, `#135`, `#139`)
- ✅ Release `v2.6.6` tagged and published
- ✅ OAuth callback split-session issue fixed (same-origin callback + secure cookie path)
- ✅ Deploy-webhook auth mismatch fixed (GitHub `DEPLOY_WEBHOOK_SECRET` aligned with homelab runtime)
- ✅ Deploy-webhook compose identity hardening shipped (`#140`, `#141`, `#142`, `#143`)
- ✅ Webhook container now executes deploy from `/home/luk-server/Lucky`

## Immediate Next
1. **Deploy status truthfulness**
   - Make `.github/workflows/deploy.yml` fail when webhook command fails (not only when webhook endpoint returns non-2xx).
   - Add explicit completion signal/check (e.g., deploy status endpoint or webhook command-output verification).

2. **Deploy performance/stability**
   - Investigate intermittent GHCR pull timeouts (`lucky-nginx`) that trigger fallback local builds and long deploy runs.
   - Add bounded timeout/abort behavior for fallback builds in `scripts/deploy.sh`.

3. **Auth end-to-end final smoke**
   - Perform full real-user Discord login and confirm dashboard route transition with authenticated `/api/auth/status`.
   - Capture final browser-network evidence in session notes.

4. **Branch hygiene follow-up**
   - Clean any remaining local artifacts from emergency deploy debugging (e.g., untracked `.env.vercel.production`).
