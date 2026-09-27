# Position Lucky as the free music bot that keeps the call playing

- Status: Accepted
- Date: 2026-09-27
- Method: /deep-research (hybrid: market, monetization, acquisition, policy, prod data), operator approval
- Amends: `2026-05-23-lucky-oss-positioning.md` (the product pitch only; its repo-governance decisions stand)

## Context

Growth is slow and the top.gg listing got almost no views. The question was how to gain
visibility and, eventually, monetize. Production data (Postgres, Loki, Prometheus, read
2026-09-27 15:03 UTC) says the bottleneck is retention, not visibility:

- 49 guilds present; 44 without the operator's, 38 without test guilds.
- 90-day cohort: 56 guilds joined, 21 left within 24 hours, 27 still present, 17 ever used
  the bot, 5 used it more than 7 days after joining.
- 41 of 59 LEAVE events came within 1 hour of the JOIN, even with the join onboarding embed
  from `2026-06-18-in-bot-growth.md` in place since #1506.
- Active non-operator guilds: 7 in 7 days, 17 in 30 days.
- Real usage is music: 15 guilds and 465 tracks in 30 days, 43% via autoplay. Moderation
  cases 0, giveaways 0, log settings 0, one custom command.
- The most active guilds are small (9 to 200 members) and international (Italian, Polish,
  German, Arabic). Locale is not measurable (every `guild_settings.language` is the `en`
  default), so there is no evidence of a Brazilian audience yet.
- The largest guild (Discord Bots, 94k members) is a listing server with zero usage.
- top.gg is about one day live (votes since 2026-09-26). Its description leads with
  self-hosting and its tags include `typescript`, `open-source` and `self-hosted`.
- The bot is verified (`public_flags 65536`), which unlocks the App Directory and is a
  prerequisite for Discord Premium Apps.

Market research: multipurpose bots are saturated; self-hosted is a crowded developer niche;
top.gg votes reset monthly and new bots trend only briefly; paid placement converts poorly;
charging for music raises YouTube exposure (Groovy and Rythm were shut down in 2021).

## Decision

1. **Pitch:** Lucky is the free music bot that keeps the call playing on its own (autoplay
   and recommendations), for small friend servers.
2. **Showcase vs supporting:** music, autoplay, recommendations and the web dashboard lead.
   Moderation, automod, levels, reaction roles and reminders stay in the product but out of
   the headline. Self-hosting and open source move to the footer of user-facing copy.
3. **pt-BR is a hypothesis, not the identity.** Test it with a pt-BR listing variant before
   positioning around Brazil.
4. **Activation before acquisition.** Measure the first hour (#2471), fix the listing
   (#2472), then replace the onboarding command list with a one-click first song (#2473).
   Only then push new channels (App Directory, BotBlock, shareable cards).
5. **Monetization is gated.** Nothing paid until about 30 active guilds per week. Before
   that, voluntary support only. After it, test a per-server premium plan priced on limits,
   customization and 24/7, never on music playback itself.
6. **Watch-together (Go Live style) is out.** A bot cannot stream video; the only compliant
   design embeds the official YouTube player, which shows the same ads as Discord's native
   Watch Together, so it does not differentiate.

## Consequences

- The README line "No paywall, no premium tier" conflicts with point 5 and should change
  when the first paid offer is real, not before.
- The guardrails of `2026-06-18-in-bot-growth.md` still apply: no unsolicited DMs, no
  invite rewards, no core features behind votes.
- Premium Apps eligibility for Brazil and the MEI treatment of foreign income are open and
  must be checked (Developer Portal, accountant) before any paid launch.

## Alternatives considered

- **Brazil-first positioning:** rejected for now; no usage evidence of a Brazilian audience.
- **Multipurpose (music + moderation) pitch:** rejected; saturated category and the
  moderation features have no adoption.
- **Paid acquisition:** rejected; poor conversion and the retention leak would waste it.
- **Monetize now:** rejected; 7 weekly active guilds would yield almost nothing and adds
  compliance work.

## Revisit when

- #2471 shows the first-hour leaves are mostly bot collectors or tests rather than users.
- Active non-operator guilds reach about 30 per week (monetization gate).
- The pt-BR listing test shows a clearly different response.
- YouTube or Discord policy changes what a music bot may do or charge for.
