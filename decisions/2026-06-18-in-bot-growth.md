# In-bot growth: a utility-first activation aid, not an acquisition lever

- Status: accepted-with-revisions (in-bot = activation/retention; acquisition stays external)
- Date: 2026-06-18
- Method: /research-and-decide (web research → decision-critic Opus artifact-only → plan → ADR)

## Context

"Bump users efficiently." The external-channel strategy is already decided
(`decisions/2026-06-17-growth-channel-sequencing.md`). This ADR decides the **in-bot /
product-led** question — should the bot _itself_ drive growth, and via which mechanics?

Already shipped: `/invite` command + a one-line "• /invite to add Lucky" Now-Playing embed
footer CTA (#1495); a top.gg `/voterewards` loop; `guildCreate`/`guildDelete` telemetry
(#1494 — the same handler an onboarding message reuses).

Web research (2026) against Discord's Platform Manipulation Policy + Developer Policy found:
in-bot acquisition lift is **low across all mechanics**, and the high-lift ideas are
**policy-prohibited** (invite rewards, referral incentives, unsolicited DMs) or
**technically impossible** (referral attribution — Discord OAuth exposes no install
source). Manipulation-pattern flags also jeopardize **bot verification** (the >75/100-server
review), which is the gate for the App-Directory channel in the external ADR.

## Decision

1. **Frame:** in-bot growth is an **activation/retention aid, not a primary acquisition
   lever.** In-bot acquisition is low-lift _and_ unmeasurable (no install-source
   attribution). Its real value is helping new servers actually use the bot → retention →
   which feeds the (external) growth flywheel.
2. **DO now (low-effort, verification-safe):** a **pure-utility join-time onboarding
   message** on `guildCreate` — getting-started / `/help` focused, **no invite or vote
   CTA at join**. (The footer `/invite` CTA already covers discovery during playback;
   doubling up at join adds redundancy and a verification gray-area for ~zero extra lift.)
3. **DEFER (effort > current lift):** user-initiated `/share` cards; expanding vote rewards
   to cosmetic/convenience perks.
4. **HARD REJECT (policy / infeasible):**
    - Unsolicited DMs to users/admins — Developer Policy prohibits.
    - Referral / invite-reward attribution — Platform Manipulation Policy bans "invite
      rewards"; also impossible (no install source in the OAuth flow).
    - Frequent / aggressive in-channel nudges — high spam + verification risk, low lift.
    - Gating **core** features behind votes — only cosmetic/convenience vote perks are allowed.
5. **Guardrail:** keep all in-bot messaging utility-first to protect **bot verification** —
   a manipulation flag there would block the App-Directory channel the external ADR depends
   on. In-bot growth must never jeopardize the bigger external lever.

## Plan (pilot)

- Pilot: the pure-utility onboarding message on `guildCreate` (reuse the existing #1494
  handler in `eventHandler.ts`). Posts one help/getting-started embed to a safe channel; no
  invite/vote CTA.
- Success: posts once on join; no verification flag; aids activation.
- Rollback: remove the message — additive, trivial.
- Measurement: **not** gated on acquisition attribution (infeasible); justified as activation.

## Alternatives considered

- **Aggressive in-channel nudges / "vote to unlock" CTAs** — rejected: high verification +
  spam risk, low lift.
- **Referral/invite-reward attribution** — rejected: policy-banned + technically impossible.
- **Unsolicited DM outreach** — rejected: Developer Policy prohibits; reputation/ban risk.
- **`/share` cards + cosmetic vote perks now** — deferred: compliant but low lift / effort;
  revisit if community engagement becomes a goal.
- **External-only (do nothing in-bot)** — rejected: the pure-utility onboarding is
  near-zero-risk and aids activation while external channels are approval-gated.
- **Join onboarding WITH a soft `/invite` CTA** — rejected (critic): a verification
  gray-area for ~zero marginal lift over the existing footer CTA.

## Consequences

- **Positive:** near-zero-risk activation aid; records the hard-NOs so they aren't
  re-attempted; doesn't endanger the external App-Directory lever.
- **Negative:** minimal acquisition lift (activation, not viral); `/share` + vote-perks
  deferred; the footer CTA and onboarding's acquisition effect are unmeasurable (no
  attribution).
- **Neutral:** external channels remain the acquisition lever; this only amplifies
  activation/retention.

## Revisit when

- **External channels stall** (App-Directory blocked / verification far off / the
  measurement sprint shows directories underperform) → reconsider `/share` + cosmetic vote
  perks as the controllable alternative.
- **Community engagement becomes a goal** → build `/share` cards + cosmetic vote rewards.
- **Discord changes its messaging/manipulation policy** → re-check the onboarding/CTA line.
- **Verification is attempted** → audit all in-bot messaging for manipulation flags first.
