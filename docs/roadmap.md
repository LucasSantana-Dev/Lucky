# Roadmap: Lucky

_Refreshed 2026-11-20. Direction: the music-first test of `decisions/2026-09-27-music-first-positioning.md`, as amended by `decisions/2026-10-18-music-first-business-review-amendments.md` and `decisions/2026-11-13-music-first-acquisition-restart.md`. Supersedes the 2026-08-03 (v2.39) roadmap, which led with Dyno parity, bulk operations and integration feeds._

Issue numbers link to `https://github.com/LucasSantana-Dev/Lucky/issues/<n>`. Open-issue state was read on 2026-11-20.

## The one decision that drives everything

The acquisition phase of the music-first test restarted on 2026-11-16 and runs to 2026-12-20. Reads moved 4 weeks (2026-11-13 ADR):

| Date                               | What happens                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-11-16                         | Acquisition restarts: top.gg ads (#2756), free directories (#2751), Meta Ads at owner's call (#2757) |
| 2026-12-14                         | Guild Members privileged intent review due (source: #3046)                                           |
| 2026-12-20                         | Acquisition phase ends                                                                               |
| 2026-12-27, 2027-01-03, 2027-01-10 | Weekly-active-guild (WAG) windows ending                                                             |
| 2026-12-28                         | Interim read (#2758): WAG under 12 means portfolio mode                                              |
| 2027-01-17                         | Continue or portfolio decision                                                                       |
| 2027-02-28                         | Portfolio case study, if portfolio                                                                   |

Continue gates (thresholds unchanged): 20 or more weekly active guilds for 3 weeks, 35% or more of new guilds hear a track in the first hour, 15% or more still active on day 8. Measured with `scripts/music-first-gates.sql`. Positioning check, separate from the gates: if under 20% of active guilds used thumbs feedback, drop the "learns your taste" pitch and lead with the weekly recap.

Rule for new work: anything that does not move a gate, protect playback or keep CI and releases trustworthy is parked below.

## Now: measurement and activation

Nothing else matters if a join cannot be seen end to end.

- #2993 `activation_events` stopped recording onboarding after 2026-10-28. Fix before spending ad money.
- #2869 weekly automatic report of the music-first gates to the owner.
- #2868 why 4 of 10 new guilds never played and 20% were removed within 5 minutes.
- #3005 invite permissions omit Set Voice Channel Status.
- #2873 autoplay quality by thumbs per mode and source.
- Owner actions: #2756, #2757, #2751, #2758, #2754 (Discord app verification), #2755 (support guild and App Directory tags).

## Now: playback reliability

Playback is the product. Reliability work comes before features.

- P0: #2859 plays dropped to zero in 48h (triage), #2860 weekly recap posted zero cards in 30 days.
- Extraction: #3002 youtubei bridge stage failing, #2866 SoundCloud fallback rejecting title variants, #2871 yt-dlp search is the first stage of every play (p50 4.2s), #3119 yt-dlp process leak, #2974 yt-dlp unpinned and PO-token provider off.
- Stability: #3036 silent exit right after a skip, #2872 16 restarts in 7 days dropping live music, #2875 memory at 94%, #2981 `replenishQueue` has no deadline, #2982 blind play after skip, #2980 watchdog restarts a paused track.
- Detection: #2920 synthetic play probe after each deploy, #3079 alert on extraction failure rate, #2746 off-box uptime ping, #3082 and #2876 Sentry noise on extraction failures, #3084 now-playing embed retry in an unwritable channel, #3080 and #3085 expected errors reported as failures.
- Recap: #3062 auto-enable fails when `/play` runs in a voice channel chat.

## Next: small music polish

Only items that help a first-hour listener.

- #3097 album and track number in now playing, #3092 album suggestions while typing `/album`.
- #2513 `stripFeaturing` misses "feat." and "ft.".
- Keep the YouTube shutoff triggers of the 2026-09-27 ADR armed (100 weekly active guilds, 1,000 installed guilds, or any notice from YouTube, Discord or top.gg).

## Next: hygiene that keeps CI and releases trustworthy

- Release: #2539 stale release PR deps, #2710 release-please drops squash bodies that do not parse (repo setting).
- Tests: #2940, #2939, #3067, #2938 flaky or host-dependent specs; #2937 and #2590 Windows and fresh-worktree tooling.
- Security: audit-gate acceptances #3070 and #2947 stay until upstream ships fixes. #2377 guild data kept forever after the bot leaves (privacy).
- Ops: #2874 Prometheus retention, #2400 local Docker storage.

## Decision gates

- 2026-12-14: Guild Members intent review, deadline from Discord's notice that Lucky passed 10,000 users (#3046). The Message Content intent was dropped in #2717 and is not needed by current features (#3046).
- 2026-12-28: interim WAG read (#2758).
- 2027-01-17: continue or portfolio.
- If continue: App Directory, the Brazil question (the pt-BR cohort split was cut on 2026-10-18, so it needs fresh evidence) and a YouTube-free mode. A paid tier needs 300 weekly active guilds for 4 weeks and a YouTube-free mode holding at least 50% of sessions.
- If portfolio: about 2 hours a week of maintenance and a published case study by 2027-02-28.

## Parked until the 2027-01-17 decision

Not cancelled, not scheduled. Revisit only if the decision is continue.

### Moderation and community track

- Dyno parity: #1777 mod-log parity, wave 2 (highlights, forms, fun pack, tags). Moderation cases ever: 0 as of 2026-09-27.
- Bulk operations: #1765 `/bulk-*` family and phases 3 and 4.
- AutoMod: #2715 kill-switch decision (disabled globally in prod while 3 guilds configured it; see the issue for options) and #2467 dashboard race.
- Context-menu pack, welcome and leave editor, giveaways dashboard page, role groups v2, move-message extensions, reaction-roles dashboard follow-ups.
- Integration feeds spine (RSS, YouTube, Twitch clips), Twitch EventSub tier 2 (needs a broadcaster OAuth flow ADR), #2654 EventSub 401 retries, #3088 dead RSS feed logging.
- Voice flows: voice logging, join-to-create, voice XP.
- Guild Automation removal (decided 2026-08-03, `decisions/2026-08-03-guild-automation-remove.md`): it is a decided removal, not a revival, so it may run as cleanup before 2027-01-17 only if it touches no playback code and capacity is free.

### Dashboard

- Dashboard audit epic #2441 and its children (#2465, #2456, #2447), embed builder #2645, a11y tokens #2575 and #2576, e2e health #2436, #2437, #2531.

### Infrastructure and platform

- Blue/green web tier (#1785, #1800), Docker CI optimization, Redis removal, OpenTelemetry tracing, Vitest migration (#1634), Node 26 and TypeScript 7 (#1705), mutation-gate tiers.
- Observability programme (#2393, #2394, #2395, #2396), CI overflow runner #2403, render sidecar #2692.
- Refactors that collide with playback work: #2771 `executePlayHandler` split, #2484 `handlePlayerStart` complexity. Do these only after playback PRs settle.

### Monetization

- Off the roadmap while the hosted bot can stream YouTube. Only a GitHub Sponsors link with no perks. See the 2026-09-27 ADR, decision 4.

## Explicit non-goals

- Server Wrapped, the per-server taste profile and the public share page: cut from the test by the 2026-10-18 amendment (decision 8).
- Apple Music or YouTube Music taste integration.
- RabbitMQ, Kafka or NATS: keep Redis pub/sub.
- Blue/green for the bot process (`decisions/2026-07-11-bot-redeploy-no-bluegreen.md`).
- Watch-together (Go Live style): out per the 2026-09-27 ADR.
- Hand recruiting and the pt-BR cohort split: cut by the 2026-10-18 amendment.
- Promoting self-hosting as a way around hosted-bot limits.
- Moonrepo or turbo (`decisions/2026-07-12-moonrepo-adoption-deferred.md`).

## How to keep this file honest

Regenerate it when a music-first ADR changes a date or a gate, and at each decision date above. If a new issue does not map to Now or Next, it belongs in Parked, or it needs an ADR amendment first.
