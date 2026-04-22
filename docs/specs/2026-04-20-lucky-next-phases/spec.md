---
status: proposed
created: 2026-04-20
owner: lucassantana
pr: 
tags: premium,engagement,visibility,roadmap
---

## Imported from plan

# Lucky — Next Phases Ultraplan

**Date**: 2026-04-19
**Sources**: [`lucky-competitive-analysis.md`](./lucky-competitive-analysis.md) (10-bot competitive scan) · [`lucky-visibility-plan.md`](./lucky-visibility-plan.md) (growth playbook)
**Premise**: Lucky's reliability + music + dashboard core is mature (the 6-week roadmap in `docs/BOT_COMMAND_ROADMAP_BENCHMARKS.md` is mostly ✅). The next phases are about **engagement breadth + revenue + visibility**, not music depth.

## Phase Sequence

```
Phase 0 (this week, ~5h)       → Visibility quick wins   → unblock everything else
Phase 1 (weeks 2-3)            → Engagement loops MVP    → retention floor
Phase 2 (weeks 4-6)            → Premium tier surfacing  → revenue + flywheel
Phase 3 (weeks 7-10)           → Engagement v2 + analytics → moat
Phase 4 (months 4-6)           → BR cultural fit + scale  → differentiation
```

Anti-recommendations from competitive scan are honoured throughout: **no multi-bot instances (Jockie's moat), no LLM chat at indie cost basis, no global cross-server economy, no NSFW image ML, no scheduled broadcasts** (Discord-native).

---

## Phase 0 — Visibility Quick Wins (this week, ~5h)

Pulled from [`lucky-visibility-plan.md`](./lucky-visibility-plan.md) §6. Order is dependency-first.

| Order | Task | Effort | Why first |
|---|---|---|---|
| 1 | Add `LICENSE` (ISC) to repo root | 5 min | README references it; GitHub shows none — credibility blocker |
| 2 | Sharpen README hero section + add invite link | 15 min | No public invite URL anywhere right now |
| 3 | Verify `assets/lucky-social-preview.png` renders on GitHub & Discord paste | 10 min | Free OG signal |
| 4 | Submit to top.gg (banner + tags + long description) | 45 min | Tier-1 traffic source, single biggest install lever |
| 5 | Wire `/webhooks/topgg-votes` Express endpoint + Redis vote-streak | 45 min | Locks in retention flywheel from Day 1 |
| 6 | Open 3 awesome-list PRs (discord-united, gillesheinesch, jacc) | 30 min | 1-2 likely to land in 4 weeks; cumulative star impact |
| 7 | Create Lucky support Discord (6-channel spec) + dogfood Lucky as its mod bot | 30 min | Distribution channel + marketing story |
| 8 | First "This week in Lucky" thread on X/Bluesky | 15 min | Start the build-in-public cadence now while motivation is high |

**Stretch (next week)**: First Dev.to post — *"Cold Redis Kills Your Music Bot — Here's How We Fixed It"*. Real war story from the recent fix; turn engineering wins into acquisition surface.

---

## Phase 1 — Engagement Loops MVP (weeks 2-3)

Highest-ROI gaps from the competitive scan. Each ships as one-PR-per-feature per the existing roadmap rule.

1. **Welcome / Goodbye automations + Reaction Roles** (S) — quickest QoL win, high adoption in <1k-member servers. Inspired by Nekotina, MEE6, Loritta.
2. **Polls & Giveaways module** (S) — viral via "join giveaway" invites. MEE6 / Nekotina pattern.
3. **Roleplay/Social Actions Phase 1** (S) — `/hug`, `/pat`, `/kiss` with tracked counters. BR/anime cultural fit signal at near-zero cost.
4. **Birthday reminders + auto-roles** (S) — seasonal engagement spike, easy to ship.

All four are S-effort, additive (no contract breaks), and stack into a single weekly release cadence. Wires up the engagement flywheel before any L-tier work.

---

## Phase 2 — Premium Tier Surfacing (weeks 4-6)

The deferred backend gates already exist (per `docs/BOT_COMMAND_ROADMAP_BENCHMARKS.md` `/playlist collaborative` row — service-side ready, surface deferred). Same pattern likely applies to other paywalled features.

**Action**: audit `packages/backend/src/services/` for `requirePremium()` or similar guards, then wire 3-5 of them to dashboard pricing tiles. Stripe integration + entitlement claim in JWT. **Effort: S** if the gates are truly already there; **M** if any need to be added.

Pricing anchor (from competitive scan): MEE6 $1.99-42.49/mo, Rythm $4.99/mo. Suggest **$2.99 single tier** to start — undercut Rythm, premium-flavoured but accessible.

---

## Phase 3 — Engagement v2 + Server Analytics (weeks 7-10)

1. **Economy & Currency System** (M) — currency earn/spend, leaderboards, optional pets. Builds on existing leveling/XP. Nekotina-inspired but scope-disciplined: no inter-server trading.
2. **Server Analytics Dashboard** (M) — listening trends, member activity, /play heatmap. B2B argument for premium upsell on 500+ member servers. Rythm/Dyno/MEE6 pattern.
3. **Automod presets v2** (M) — expand existing presets with stricter NSFW-keyword + link-domain reputation. Trust signal for new servers.

---

## Phase 4 — BR Cultural Fit + Scale (months 4-6)

1. **`/playlist collaborative` command surface** — already deferred in roadmap; cleanest unlock signal that we're shipping engagement breadth.
2. **PT-BR localised dashboard + slash command translations** — Loritta/Flavi compete here; Lucky has author advantage.
3. **Tickets/Support module** (M) — only after engagement loops prove out.

Defer until phases 1-3 show measurable traction (KPI gates below).

---

## Measurement Gates Between Phases

From [`lucky-visibility-plan.md`](./lucky-visibility-plan.md) §5. Promote between phases only when targets hit:

| Gate | Phase 0 → 1 | Phase 1 → 2 | Phase 2 → 3 | Phase 3 → 4 |
|---|---|---|---|---|
| GitHub ⭐ | 5 | 15 | 30 | 60 |
| top.gg 🗳 | 10 | 50 | 150 | 400 |
| Server installs | 5 | 25 | 100 | 300 |
| Avg `/play`/day | — | 30 | 100 | 300 |
| Premium MRR | — | — | $50 | $300 |

If a gate stalls for 2+ weeks, **pause the next phase** and debug: Is the bot crashing? Is the dashboard slow? Ask the support Discord directly.

---

## What I'd ship first if you said "go now"

1. `LICENSE` file (5 min) → unblocks listings.
2. Sharpened README hero + invite URL (15 min) → bare minimum to get visitors-to-installs working.
3. top.gg listing draft (45 min) → biggest single visibility lever.

That's ~70 minutes of work, all S-effort, all Phase 0. Recommend starting there and using the rest of Phase 0 as the back half of the same session.

