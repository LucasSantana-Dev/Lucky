# ADR 2026-07-02 — Criativaria server config: native AutoMod (alert-only for self-harm), starboard now, scripted REST

**Status:** Accepted
**Deciders:** Lucas Santana
**Related:** `decisions/2026-07-01-bot-monitoring-dead-man-first.md` (bot-downtime evidence), weekly digest (#1609)
**Trigger:** operator request — configure the Criativaria guild (895505900016631839) via API: content-safety automod (hate speech + self-harm/self-medication incentivization), engagement, forum deprecation.

## Context

Verified state (prod DB + Discord API, 2026-07-02): 18 reaction-role mappings exist; Lucky `AutoModSettings` row is an all-rules-off shell; XP/levels configured; starboard NOT configured (feature shipped — `starboard_configs` table live); weekly digest shipped 2026-07-01 (first post Monday, reads+posts chat-geral); **3 Discord-native AutoMod rules already enabled** — managed presets [profanity, sexual, slurs] + spam + mention-spam — **all block-only, no alert action**, so moderators never see enforcement. Forum `fórum-ser-tech` deprecated (content lives on the web-app); digest already re-pointed to chat-geral. Bot has admin (covers MANAGE_GUILD). Audience: PT-BR, women 30+ in career transition — mental-health topics arise legitimately.

## Decision

**D1 — Content safety via Discord-native AutoMod, with a two-class policy (operator's call, independently reached by the design critic):**

- **Hate speech: BLOCK.** Keep the existing managed-preset rule (profanity/sexual/slurs — Discord-maintained, multilingual) blocking, and add `SEND_ALERT_MESSAGE` → `chat-dos-mods` so blocks are visible to moderators.
- **Self-harm / self-medication incentivization: ALERT-ONLY.** New custom keyword rule (PT-BR list with wildcard + no-diacritic variants), action = alert to `chat-dos-mods` only — **no block, no timeout**. Rationale (the highest-stakes call in this set): keyword matching cannot distinguish "estou pensando em me machucar, preciso de ajuda" from incitement; blocking at the post layer silences help-seekers in the exact community where they must not be silenced. Moderators see the alert and respond as humans. False positives cost a mod-channel glance, not a member's trust.
- Native over Lucky's `words` rule: platform-level, blocks pre-send, survives bot downtime (2026-07-01: 4.5h outage). Lucky AutoModSettings stays all-off (no double enforcement).

**D2 — Engagement: enable starboard NOW alongside the digest** (critic-corrected from "defer"): config-only, zero risk, and it gives the digest measurement a parallel signal instead of a baseline-less read. New `#✧･ﾟdestaques･ﾟ✧` channel, ⭐, threshold 3, self-star off. Bigger engagement builds stay deferred pending digest+starboard data (~4 weeks).

**D3 — Vehicle: scripted REST calls (bot token) with idempotency guards** (check-before-create on rules/channels). Guild Automation Manifest extension deferred until guild-config changes recur — it doesn't model native AutoMod today and a one-shot doesn't justify a new Lucky feature.

**Forum archival:** lock `fórum-ser-tech` read-only (deny `SEND_MESSAGES` + `SEND_MESSAGES_IN_THREADS` + `CREATE_PUBLIC_THREADS` for @everyone), keep history. Reversible.

## Alternatives considered

- **Lucky `words` rule for safety content.** Rejected: delete-after-post is punitive-by-timing, dies with the bot, and the outage evidence is one day old.
- **Blocking the self-harm class.** Rejected (operator + critic, independently): suppresses help-seeking; "moderation that harms."
- **Defer starboard until digest is measured.** Rejected per critic: parallel data beats sequential; cost is a config row.
- **Extend Guild Automation Manifest first.** Deferred: right seam if guild config becomes recurring; today it's scope creep.
- **Manual UI configuration.** Rejected by the operator's explicit "via API calls".

## Consequences

**Positive:** hate-speech enforcement becomes visible to mods; help-seekers reach humans instead of a wall; safety survives bot downtime; two engagement signals accrue in parallel; everything reproducible from a script.

**Negative:** PT-BR keyword list needs curation and will both miss creative phrasings and flag benign ones (alert-only makes the latter cheap); mods need a lightweight response protocol for sensitive alerts (respond in-channel or DM — not automated); `chat-dos-mods` gains alert traffic.

**Neutral:** reaction roles untouched (already live); Lucky AutoModSettings row remains dormant.

## Revisit when

- **Mods report alert fatigue or missed incidents** after ~4 weeks → tune keyword list / thresholds.
- **A member is harmed by content the alert-only rule saw but mods missed** → reassess block-vs-alert with that evidence (still not auto-block by default; consider quarantine-style flows).
- **Guild-config changes become recurring** (≥3 in a quarter) → extend Guild Automation Manifest to model native AutoMod + channel archival.
- **Digest + starboard data at ~4 weeks** → decide the next engagement investment on measured demand.
