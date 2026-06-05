# 2026-05-13 — Deploy target: keep homelab; defer migration

## Status

Accepted (decision). Audit-triggered. Replaces the "broken deploy" RED finding
in `audit_deep_lucky_2026-05-13.md`.

## Context

The audit flagged `deploy.yml` as 80% failure rate over the last 7 days
(2026-05-06 → 2026-05-13). v2.10.0 shipped at the tag/release level but the
deploy job did not fire to homelab. The question:

> Keep debugging the homelab deploy pipeline or migrate the Discord bot to a
> managed service (Fly.io, Render, Railway, Vercel)?

## Research

### Failure analysis (Phase 1)

Pulled the last failed run's log. Root cause:

```
/home/runner/work/_temp/388c8326-...sh: line 28: syntax error near unexpected token `('
```

Located in `.github/workflows/deploy.yml:46`:

```bash
                  else
                    commit_sha="${{ github.sha }}"
                  fi"          # ← stray closing quote
                  max_wait=600
```

Introduced in commit `c1b61444` (PR #812, 2026-05-05): "auto-deploy on
docker-publish success via workflow_run". A `"` was left behind during the
refactor that introduced the `if/else/fi` block around `commit_sha`.

**Every "failure" since May 6 has the same bash syntax error.** Nothing
architectural is broken. The pipeline shape (workflow_run trigger →
docker-publish wait → homelab webhook) is intact.

### Alternatives considered

| Option                         | Setup cost                          | Monthly cost                  | Lock-in                            | Discord WS fit                         | Observability fit                                                                              |
| ------------------------------ | ----------------------------------- | ----------------------------- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Stay on homelab (fix typo)** | 1 char                              | $0                            | None                               | Native (persistent connection)         | Already integrated (Langfuse + OTel + Grafana per `project_homelab_observability_deployed.md`) |
| Fly.io                         | ~4h (deploy.toml, secrets, builder) | $20–60 (machines + bandwidth) | Medium (proprietary deploy format) | Good (persistent VMs)                  | Sentry only; would need re-integration with Langfuse                                           |
| Render                         | ~4h                                 | $25/svc + DB                  | Medium                             | Good (background workers)              | Sentry + Logtail; would re-wire OTel                                                           |
| Railway                        | ~3h                                 | $5 base + usage               | Medium                             | Good                                   | Limited tracing; OpenTelemetry support recent                                                  |
| Vercel                         | N/A                                 | —                             | —                                  | **Bad** (serverless, no persistent WS) | —                                                                                              |
| Stay broken (defer)            | 0                                   | $0                            | —                                  | —                                      | —                                                                                              |

## Critic challenge

The critic's question — "what changes the answer?" — is the only one that
matters: **was migration actually a candidate, or did the audit's RED severity
make it look like one?**

The audit measured _severity_ by failure-rate (5 consecutive fails = RED),
not by _blast radius_ of the cause. A 1-char typo and an architectural
breakage have the same failure-rate signal but radically different fixes.
Surface-level "deploy is broken" → "consider migration" is a misclassification
in this case.

Migration candidates above all require multi-hour setup, new monthly cost,
and re-integration with the homelab observability stack we just deployed
(2026-05-09). The fix-the-typo path is **1 character + 1 PR**.

The critic flips the leading option: "stay on homelab" wins by an order of
magnitude on every dimension that matters.

## Decision

**Stay on homelab.** Fix the typo in `deploy.yml:46`. Do not migrate.

## Consequences

### Positive

- Zero new infra cost, zero migration risk
- Observability stack stays consolidated (Langfuse + OTel + Grafana)
- Deploy pipeline is back to the pre-PR-#812 working state
- No secret rotation, no DNS changes, no re-wiring required

### Negative

- We continue to rely on homelab uptime (single point of failure)
- The `workflow_run` trigger chain (Build & Push Docker → Deploy to Homelab)
  has 2 stages and is harder to debug than a single managed-service deploy
- No multi-region or auto-scaling story

### Neutral

- This decision does not preclude future migration if homelab proves unreliable
  in production — see revisit triggers below

## Revisit when

Re-open this decision if **any** of the following hold:

1. **Homelab availability < 99% over a 30-day window** (the bot is offline >
   7.2 hours/month). Not the case today.
2. **deploy.yml needs > 1 reactive fix per quarter** (a recurring-failure
   signal that the pipeline is fragile, not just typo-prone).
3. **A managed-service free tier covers Discord-bot-grade persistent
   connections** (Fly.io has had this on roadmap; check yearly).
4. **Lucky's MAU grows past ~5k guilds** where horizontal scale or
   multi-region matters more than self-hosting savings.
5. **A homelab hardware failure forces an unplanned migration anyway** —
   in which case revisit alternatives under emergency constraints.

## Tracking artifacts

- Fix PR: TBD (will be opened by this session)
- Failed runs to date: 4 consecutive (May 6) + 1 skipped (May 13 on v2.10.0
  tag push)
- Observability memory: `project_homelab_observability_deployed.md`
- Audit: `audit_deep_lucky_2026-05-13.md` (RED finding)
