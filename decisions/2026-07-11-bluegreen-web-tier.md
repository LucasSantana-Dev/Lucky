# ADR 2026-07-11 — Blue/green zero-downtime deploys — true B/G for web tier, fast-rollover for bot

**Status:** Proposed (Phase 1 — web tier B/G on staging, ready for sign-off; Phase 1b — prod wiring deferred for explicit operator cutover)
**Deciders:** Lucas Santana
**Related:** Issue #1785, `docker-compose.staging.yml`, `nginx/upstream-active.conf`, `scripts/bluegreen-flip.sh`, `.github/workflows/deploy.yml` (Phase 1b integration pending)
**Trigger:** operator goal (2026-07-11) — "stay online during deploys" while Top.gg listing is in 1–2wk review; critical bot uptime required (#1784).

## Context

Lucky runs **one Discord bot token, unsharded** (11 guilds). Discord permits only **one gateway IDENTIFY per token+shard**. Two `lucky-bot` containers on the same token cannot both be live; the second IDENTIFY force-disconnects the first. This makes classic true blue/green impossible for the bot.

**Current state:** Single-color deploy: `docker compose up -d` recreates changed containers → ~30s–1m downtime per container (backend/frontend both affected if both ship a change, because they're brought up serially). The bot, backend, and frontend share the same Postgres and are deployed together, so the entire stack is unavailable if any component redeploys.

**Requirement:** Minimize HTTP downtime during a deploy of the dashboard (backend + frontend), without breaking the bot or introducing multiple gateway connections.

## Decision

Implement a **tiered approach**:

### Phase 1 — Web tier true blue/green (backend + frontend) [THIS PR]

- Define `backend-blue`, `backend-green`, `frontend-blue`, `frontend-green` services in `docker-compose.staging.yml`.
  - Same images + environment as the existing single-color services.
  - Distinct `container_name` and Docker network alias per color.
  - Both colors live on the same Postgres + Redis (shared during the flip).
- **Flip mechanism** (idempotent): `scripts/bluegreen-flip.sh <backend|frontend> <blue|green>`:
  1. Bring up the target color with the new image (docker compose up -d).
  2. Wait for its `/health` to pass (bounded retries, timeout ~90s).
  3. Atomically repoint nginx via an include file (`nginx/upstream-active.conf`): rewrite the active-color variable.
  4. Reload nginx (zero-downtime via `nginx -s reload`).
  5. Stop the old color.
  - Idempotent: safe to re-run if step N fails; state after success is reproducible.
- **Result:** zero HTTP downtime for dashboard/API during deploy; old color is drained before shutdown.
- **Deployment flow** (eventual, Phase 1b): `docker compose up -d --no-deps backend-blue && ./scripts/bluegreen-flip.sh backend blue && docker compose up -d --no-deps frontend-green && ./scripts/bluegreen-flip.sh frontend green`.

### Phase 2 — Bot fast-rollover (minimize the unavoidable blip) [DEFERRED]

- Do NOT implement dual bot containers. Single-color fast-rollover only:
  - `docker compose pull lucky-bot` (no downtime).
  - `docker compose up -d --no-deps lucky-bot` (triggers IDENTIFY → Discord moves session → old exits; downtime ~2–5s).
  - Rely on the existing post-deploy **bot health-gate** (gateway-connected gauge from #1774) as go/no-go; auto-reconnect handles queue backlog.
- Note: cross-process gateway RESUME (persist session_id+seq to Redis) or sharding rolling-restart are **YAGNI** — only justified at scale. Future option if the blip matters at scale.

### Phase 3 — Migration safety (blocks safe B/G) [DEFERRED]

- Because blue + green web run against the **same** Postgres during the flip, all Prisma migrations must be **backward-compatible**: additive first, no destructive column drops/renames in the same deploy as the code that stops using them (expand → migrate → contract pattern).
- Add a CI check (Phase 1b, optional) that flags destructive ops (`DROP`, `ALTER ... DROP`, renames) for manual sign-off. (Agent `prisma-migration-verifier` can be wired into PR checks if needed.)
- Update the deploy runbook to document this invariant.

## Rationale

- **Imminent uptime requirement:** Top.gg listing review window (2026-07-11 to ~2026-07-25) demands 99.9%+ uptime. The bot is single-connection by Discord's protocol, so Phase 1 (web-only true B/G) gives us zero-downtime HTTP, and Phase 2 (fast-rollover) minimizes the bot reconnect blip without complexity.
- **Safety first:** Blue + green services live side-by-side (additive to the current single-color setup), reversible in < 5 min (point nginx back to blue, stop green). No forced cutover; staging-first validation before prod.
- **Nginx already has the mechanism:** `resolver`, variable `proxy_pass`, and `/health` healthcheck on both services mean the infra is ready. Script is ~60 lines; no new system complexity.
- **Shared Postgres is acceptable Phase 1:** The flip duration is ~10s (healthcheck + reload). A 1–2 second window where new requests hit blue and old requests drain from green is survivable. Destructive migrations are deferred to Phase 3 because they change the schema atomicity story.
- **Skip dual-bot complexity:** sharding, session persistence, cross-shard coordination would add significant complexity (new Redis ops, ordering invariants, gateway reconnect state machines) for a 2–5s downtime we can live with.

## Acceptance criteria

✓ (Phase 1 staging implementation)
- A deploy of backend/frontend to staging causes **zero** failed HTTP requests through nginx (verify with `while true; do curl -s http://localhost:8093/health; done` during deploy).
- `scripts/bluegreen-flip.sh` is idempotent: re-running after a successful flip leaves the system in the same state.
- The flip script includes a clear header documenting that it's run by the deploy pipeline and that migrations must be backward-compatible.
- Existing single-color deploy continues to work unmodified (blue/green is additive).

⏸ (Phase 1b, deferred for operator sign-off)
- `.github/workflows/deploy.yml` wires the web-tier flip flow to the production stack.
- Operator validates the flow on a staging run with a real branch, confirms zero HTTP downtime, and signs off before prod cutover.

⏸ (Phase 2, deferred)
- Post-deploy health-gate confirms bot gateway is re-connected.

⏸ (Phase 3, deferred)
- CI pipeline flags destructive Prisma migrations or requires manual approval before ship.

## Alternatives considered

**A. Do nothing / live with downtime**
- Cost: 30s–1m downtime per deploy, blocking the Top.gg review's uptime requirement.
- Rejected: explicit operator goal to stay online.

**B. Dual-bot containers with session persistence**
- Add a Redis-backed gateway session cache (session_id, seq, etc.) so a new bot container can RESUME instead of IDENTIFY.
- Cost: new state invariant (session must be durable + correct), new operational concern (cache TTL, invalidation, clarity on Discord's RESUME semantics).
- Complexity: discord.js does not expose session_id/seq directly; would require patching or a custom client.
- Gain: eliminate the 2–5s blip entirely.
- Decision: YAGNI for 11 guilds. Revisit only if blip causes production incidents.

**C. Pre-build and stash the green image before the flip**
- Separate build and deploy phases: build green image in CI, stash it; deploy just pulls and runs it.
- Cost: new artifact store (S3 or registry), new CI phase, new complexity.
- Gain: saves ~30–60s of build time during the flip (but nginx reload is still < 1s).
- Decision: YAGNI for Phase 1. Revisit if docker-build wall-clock is a blocker.

## Revisit when

- **Top.gg review resolves** (~2026-07-25): downtime tolerance may increase; deprioritize uptime-critical work if the listing is approved.
- **Scale or reliability requirement changes:** if guild count grows or a blip causes incidents, revisit Phase 2 (session persistence) or Phase 3 (migration safety hardening).
- **Nginx or Docker Compose major version update:** check that variable `proxy_pass` and reload semantics haven't shifted.
