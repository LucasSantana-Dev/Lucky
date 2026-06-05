# ADR — Stay on docker-compose v2 (single-node homelab)

- **Status:** Accepted
- **Date:** 2026-05-13
- **Decided by:** `/research-and-decide` composite
- **Related:** ADR `2026-05-13-deploy-target-keep-homelab.md`, PR #848

## Context

Lucky runs on a single-node homelab box behind Cloudflare Tunnel. Current orchestration is docker-compose v2. PR #848 added resource limits, healthchecks, and security hardening but did not change orchestration. The question: is compose still the right runtime, or should we migrate to nomad / k3s / podman-quadlet / docker swarm?

Phase-1 research evaluated five candidates across 8 dimensions (effort, weekly tax, observability fit, systemd recovery, zero-downtime, volume safety, asleep-failure mode, 12-month ops cost). Critic Phase 2 stress-tested the leading "stay on compose" choice.

## Decision

**Stay on docker-compose v2.** No migration. Re-evaluate only when concrete escalation criteria fire (see Revisit triggers).

## Alternatives considered

- **Nomad single-node** — Strongest runner-up. ~130h migration. Native Prometheus/OTel, declarative rolling reschedule. Rejected because the deploy-target ADR locks homelab single-node and there is no team to onboard.
- **k3s** — ~156h migration. kubectl skill transferable, but operational overhead high for solo-operator + single-node.
- **Podman + quadlet** — ~52h migration. Systemd-native, rootless. Critic flagged this was undervalued in research — operator already uses systemd-style hooks (claude-env, launchd). Acknowledged but not enough to flip the decision: compose's existing momentum (PR #848 just shipped 8 commits of hardening) outweighs the migration cost.
- **Docker Swarm** — ~62h migration. Compose-compatible, multi-node-ready. Rejected: no multi-node need on the roadmap.

## Consequences

**Positive**

- Zero migration cost. PR #848's hardening immediately pays off.
- Observability stack (Langfuse + OTel + Grafana, also docker-compose) stays compatible.
- Operator legibility — `docker compose up -d` is universally understood.

**Negative — must be acknowledged in this record per critic review**

1. **`/var/run/docker.sock` is mounted into the webhook container** (`deploy/Dockerfile` + `docker-compose.yml`). This grants the webhook process effective root on the host. The blast radius is bounded only by "the homelab is a private box" — not by any container-level mitigation. Acceptable under homelab-only deploy posture (ADR `2026-05-13-deploy-target-keep-homelab.md`); would NOT be acceptable on shared infrastructure. Mitigated by pinning `almir/webhook:2.8.3` in PR #848 instead of `:latest`.
2. **Voice-drop on bot restart is NOT inherent to single-node** — Discord's gateway supports session resumption. The actual risk is _ungraceful_ termination. Solving that needs graceful-shutdown hooks in the bot, not orchestration. Tracked separately as a backend improvement, not as a reason to switch orchestrators.
3. **No horizontal escape hatch** — if a service exceeds its `mem_limit` consistently, compose's only response is restart. Nomad/k3s would allow burst-to-secondary. Mitigated by the observability stack now being able to surface OOM patterns before they become incidents.

## Pilot / adoption plan

None required (no change).

## Revisit when

Any one of these triggers a re-evaluation (with `nomad single-node` as the default candidate):

1. **OOM kills on any service > 1/month** for two consecutive months → compose's lack of headroom is biting.
2. **Single reboot causes > 5 min of public unavailability** (measured via Cloudflare Tunnel uptime) → declarative scheduler needed.
3. **Operator needs to scale frontend, backend, or bot to > 1 replica** (e.g., to test rolling deploys without voice drops) → compose can't coordinate.
4. **A second machine joins the homelab** for any reason (more storage, hardware redundancy) → swarm or nomad's multi-node value materialises.
5. **Observability data over 90 days from 2026-05-13** shows steady-state resource use within 60% of the configured limits _and_ no incidents → confirms compose was the right call; reset the clock.

## References

- ADR `decisions/2026-05-13-deploy-target-keep-homelab.md`
- PR #848 — `chore/docker-overhaul`
- Memory: `project_homelab_observability_deployed`
- Critic Phase-2 findings on docker.sock + escalation criteria
