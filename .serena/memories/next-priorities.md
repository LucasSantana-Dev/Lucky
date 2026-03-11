# Next Priorities (2026-03-10)

## Completed in This Session
- ✅ PR chain shipped and merged: `#145`, `#146`, `#147`, `#148`, `#149`
- ✅ Release `v2.6.7` tagged and published
- ✅ Homelab deploy executed and passed (`run 22920473406`)
- ✅ Auth smoke contracts passing (`/api/auth/discord` callback host + secure cookie, `/api/health/auth-config` status ok)
- ✅ Backend lint debt closure branch merged (`#147`) and strict backend lint re-enabled

## Immediate Next
1. **Final user-login smoke**
   - Complete a real Discord login on `https://lucky.lucassantana.tech`.
   - Confirm callback lands in dashboard flow (not landing page loop).
   - Capture `/api/auth/status` network response after callback (`authenticated: true`).

2. **Main branch post-merge checks**
   - Confirm all push workflows for commit `7de4a9e` finish green on `main` (CI/CD, Sonar, Docker publish).
   - If any fail, hotfix on `fix/*` branch before next feature rollout.

3. **Deploy resilience follow-up**
   - Monitor for GHCR pull timeout recurrence (especially `lucky-nginx`).
   - If recurrence appears, add bounded retry/timeout policy in remote deploy script.
