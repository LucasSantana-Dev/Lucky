---
status: accepted
date: 2026-05-31
revisit_after: 2026-06-15
refines: 2026-05-30-observability-remediation-strategy
---

# Distributed tracing: defer reaffirmed — Sentry already gives OTel-based tracing; raw OTel→Tempo not worth it yet

## Status

Accepted. Re-evaluation of the **Layer-4 (distributed tracing)** portion of
[[2026-05-30-observability-remediation-strategy]], triggered 2026-05-31 when the operator elected to
start OTel early (overriding that ADR's 2026-06-15 gate). A raw-OTel prototype + a fresh
research → critique were run. Outcome: the original DEFER **stands, now evidence-backed**, and a
third option (Sentry-native tracing) was identified and assessed.

## Context

The audit flagged the tracing pillar as absent (OTel dormant; only Sentry @ 10%). The operator
chose to revisit early. Under the no-big-bang gate, a backend OTel prototype was built on branch
`feat/otel-layer4-prototype` (@ 85731672). It **tripped the gate**, and a research pass surfaced
that `@sentry/node` v8+ is OpenTelemetry-based internally — i.e. Lucky may already have most of the
tracing it wants, via Sentry, without the OTel SDK.

## Options (re-assessed with new evidence)

| Option                                                            | Verdict            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Defer** (status quo; Sentry @ 10%)                          | **CHOSEN**         | No new cost/effort; Sentry continues capturing backend transactions at 10%. Tracing genuinely not needed until a real trigger fires (below).                                                                                                                                                                                                                                                                                           |
| **B — Raw OTel → homelab Tempo/Grafana**                          | Rejected (now)     | Prototype tripped the gate: **+171 packages (77 `@opentelemetry/*`)**, ESM `node --import` start-command change (Dockerfile + scripts), `tsx` dev-mode friction, coverage exclusion. Grafana **exemplars** (metric↔trace) are the real draw — but they require exactly this plumbing. ROI-negative at 2 services with no latency incident.                                                                                             |
| **C — Sentry-native tracing** (leverage installed `@sentry/node`) | Rejected as framed | Lowest code-friction (no new packages; already capturing at 10%), BUT: (1) **hidden cost** — Sentry free tier ≈ 10k spans/mo; 10% sampling likely exceeds it → ~$26–29/mo Team tier OR drop to ~5% (degrades signal); (2) the ESM `--import` friction is **NOT avoided** (Sentry also recommends it for full auto-instrumentation); (3) no Grafana exemplar correlation. Viable only if the operator accepts the cost/sample tradeoff. |

Critic (Opus) verdict: **REVISE & DEFER** — all "adopt now" options are premature; the revisit
should be event-driven, not date-driven.

## Decision

**Defer distributed tracing (reaffirmed).** Keep Sentry @ 10% as-is. Do NOT adopt B or C now.
When a trigger fires, the preferred order is:

- **C (Sentry-native)** for the fast path — it's already OTel-based tracing without the SDK
  plumbing — **if** the operator accepts ~$26/mo (or a ~5% sample).
- **B (Tempo + exemplars)** only if metric↔trace correlation becomes worth the OTel plumbing
  (e.g. recurring latency debugging). The prototype branch is reusable for this.

## Consequences

**Positive:** no ~40–50h sink; zero new deps on `main`; Sentry @ 10% continues; the prototype is
preserved as evidence (`feat/otel-layer4-prototype`, parked, not pushed).

**Negative:** tracing pillar stays shallow — Sentry @ 10%, backend-only auto-instrumentation, bot
manual-only. No metric↔trace correlation. The "low-friction Sentry-native win" turned out to carry
a cost the first framing missed.

**Neutral:** Sentry-native (C) is the likely future fast-path; the OTel prototype (B) is reusable if
Tempo is ever chosen. The two are not mutually exclusive (Sentry SDK can dual-export to OTLP).

## Revisit when (sharpened — event-driven, not just the date)

- A production latency mystery unexplained by metrics + logs (backend P95 > 1s).
- A **3rd service** (worker / cache / queue) creating real multi-service request chains.
- Operator reserves ~40h AND wants Grafana exemplars → take **Option B**.
- Operator accepts the Sentry span-quota cost (or a ~5% sample) → take **Option C** (fast path).
- **2026-06-15 checkpoint:** review 14 days of data and decide against the triggers above — not the
  calendar date alone.

## Related

- [[2026-05-30-observability-remediation-strategy]] — the parent ADR this refines.
- Prototype: branch `feat/otel-layer4-prototype` @ 85731672 (env-gated backend OTel bootstrap; type-checks clean; parked).
- PR #1103 (observability Layers 1-3) — the prior decision's implementation.
