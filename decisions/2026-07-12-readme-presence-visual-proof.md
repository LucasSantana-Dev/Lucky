# README presence — ship public-landing visual proof; plumbing is trivial, not a blocker

- **Date:** 2026-07-12
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Method:** `/research-and-decide` — research agent (live-site + competitor survey) + artifact-only `decision-critic` (NEEDS_REVISION → revised after human-browser verification)

## Context

Lucky's original goal was "more presence." The GitHub README is text/table-strong (positioning,
badges, feature/comparison/command tables, quickstart) but has **zero product visuals** — a wall
of text. The mascot + logo threads already closed (see
`decisions/2026-07-12-brand-asset-regen-tooling.md`); this decides where presence effort goes next.

**Verified in a real browser (the critic demanded this; a fetcher had returned 403/404):**

- `https://lucky.lucassantana.tech` is **UP** and **genuinely polished** — dark theme, neon-cat
  logo, hero + CTAs, a "What Lucky does" 6-card feature grid, "A real web dashboard" section,
  a dev/self-host architecture-card section, Apache-2.0 footer. Fully public (no auth).
- The top.gg listing **exists** at bot id `962198089161134131` (the `839686019796811776` ref that
  404'd is a **wrong/stale bot id**).
- Constraint: the _authed_ dashboard needs Discord OAuth login, which the assistant may NOT perform.
  But the **public landing is assistant-screenshottable**, removing the operator bottleneck.

## Decision

**Ship visual proof from the polished PUBLIC LANDING, now, assistant-driven.** Concretely:

1. Capture clean screenshots of the live landing (hero, "What Lucky does" grid, the
   dashboard/feature section) and add them to the README with short captions. No auth, no operator
   dependency, no design work.
   **Delivered scope (this PR):** shipped `assets/screenshots/landing-features.png` (the
   feature grid). The hero shot is deferred pending #1818 (landing still renders "Apache 2.0"
   while the project is ISC) so the README doesn't advertise the wrong license.
2. Fix the two verified plumbing bugs (trivial, not a blocker): the README live-demo link
   (`href="https://lucassantana.tech"` → `https://lucky.lucassantana.tech`) and the wrong top.gg
   bot id (`839686019796811776` → `962198089161134131`); add a top.gg badge/link.
3. **Optional operator follow-up (not a blocker):** a real authed-dashboard screenshot or a short
   Loom, if wanted — the landing already _claims_ "a real web dashboard"; a real shot would _prove_
   it. Gated on operator (login), so it is a nice-to-have, done last.

Framed honestly: this is **cheap, obvious polish** (empty README + polished landing already built),
**not a validated growth lever.** No heavy measurement plan (YAGNI for a solo OSS bot).

## Alternatives considered

- **top.gg listing audit as the #1 lever** (research's top pick) — folded in as bug #2 (fix the id +
  badge), but the listing already exists, so it is a small fix, not the headline.
- **Bot-in-action demo GIF / screencast** — higher effort (needs a Discord test server + capture +
  edit); deferred. A landing screenshot is far cheaper for equal first-impression lift.
- **Authed dashboard screenshots as the primary asset** — rejected as the _primary_ because the auth
  constraint makes the operator the bottleneck; demoted to optional follow-up.
- **"Differentiate because competing music bots omit visuals"** — DROPPED. The critic correctly
  flagged it as inferred from n=3 behavior, not evidence that visuals convert or don't.
- **Architecture diagram / secondary bot-lists / mockup galleries** — low impact-per-effort, deferred.

## Consequences

- **Positive:** README gains real visual proof in one assistant-driven pass; two broken external
  links fixed; the polished landing (already built, currently under-leveraged) starts working for
  the project. Reversible (README edit).
- **Negative / risk:** landing-UI changes will stale the screenshots (low maintenance cost — re-snap).
  Presence may not be Lucky's actual growth bottleneck (discovery/community could matter more) — so
  this is bounded polish, not a growth bet.
- **Neutral:** authed-dashboard proof remains an open optional follow-up on the operator.

## Revisit when

- The landing page UI is redesigned → re-capture the README screenshots.
- Evidence emerges that presence is NOT the growth bottleneck (e.g. traffic data shows the Discord
  community drives adoption, not the README) → stop investing in README polish.
- The operator wants to prove the _dashboard_ specifically → add the authed screenshot/Loom follow-up.

## Related defects (found during this decision — file as issues)

- README live-demo link href mismatch (bug #1 above).
- Wrong top.gg bot id `839…` vs live `962…` (bug #2 above).
- **License discrepancy:** README/LICENSE say **ISC**, the landing footer says **Apache 2.0** —
  authoritative source must be reconciled (legal).
- Node version drift: README says Node 22, the toolchain decision (`decisions/2026-07-12-*toolchain*`)
  moved to Node 24.
- Test-count claim conflict: README "~2500 tests" vs the social-preview hero "849+ Tests".
