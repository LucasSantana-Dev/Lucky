# Music-first amendments from the 2026-10-08 business review: activation fixes, spend gates, no recruiting

- Status: Accepted
- Date: 2026-10-18
- Deciders: Lucas Santana
- Method: business action plan of 2026-10-08 (prod data from Postgres, Loki and Prometheus over
  the last 30 to 60 days, operator and test guilds excluded) and a 4-lens debate that proposed
  8 amendments; owner decision per amendment on #2759
- Amends: `2026-09-27-music-first-positioning.md` (decisions 2, 5 and 6, the plan and the
  measurement). The three continuation gates, the positioning check and the 2026-12-20 decision
  date stand. The pitch set by `2026-10-07-pitch-leads-with-weekly-recap.md` stands.
- Closes: #2759

## Context

The 2026-10-08 review read the first two weeks of the test against prod data. The leak is
activation, not acquisition:

- 61% of new guilds never play a track.
- 12 of 43 adds (28%) are removed within 5 minutes and 16 (37%) within 1 hour; only 3 of those
  16 ever played.
- A new server sees about 90 global commands in the picker (pt-BR `/vaga` among them) and an
  invite that asks for View Audit Log and Manage Messages (`BOT_INVITE_PERMISSIONS = '3173504'`).
- The weekly recap is opt-in and has 0 uptake: 0 recap channels, 0 cards. It is the only lever
  any lens found for retention in weeks 2 to 4, and day-8 activity is 2 of 12 (17%).

Sending paid traffic into that funnel would buy installs that leave within the hour, so the
review tied spend to the activation fixes. It also found gaps in how the gates are counted
(re-adds, which weeks make up the WAG window) and in the uptime clock.

## Decision

Numbering follows the 8 amendments of #2759. Approved as written: 1, 3, 4, 5, 6, 7. Cut: 2, 8.

1. **Approved. The hosted bot registers only music commands and asks for minimal invite
   permissions.** About 15 music commands are registered globally; the rest stay behind a flag
   or guild-scoped registration. Every invite permission no music command needs is dropped.
   This is a guardrail of the test, not a one-off cleanup: a command reaches the hosted picker
   only if it is a music command. (#2736)
2. **Cut. No guild recruiting in any form, and no pt-BR vs international split.** The 40 hand
   recruits of the music-first ADR (decision 5) are dropped, and so is the proposal to replace
   them with automated channels. The pt-BR vs international cohort comparison (decision 6) is
   dropped with them. Growth comes from the directories and top.gg in amendment 4 (#2751,
   #2756).
3. **Approved. The weekly recap is opt-out.** It is enabled at a guild's first successful /play,
   in that text channel. The first card says it can be turned off and carries a visible off
   button. The card goes to the guild channel only, never as a DM. (#2738)
4. **Approved. Spend is gated on shipped fixes.** The top.gg ads start by 2026-10-27 at the
   latest (#2756). Meta Ads run only if the landing page is live by 2026-10-31 (#2750, #2757).
5. **Approved. A re-add within 30 days counts once.** The WAG windows are the weeks ending
   2026-11-29, 2026-12-06 and 2026-12-13. (#2753)
6. **Approved. The 14-day uptime clock starts at the first off-box ping** (#2746). Until
   2026-11-22 the bot restarts at most once per day; from then on, at most once per week
   (#2747).
7. **Approved. WAG under 12 on 2026-11-30 triggers portfolio mode that day** (#2758), without
   waiting for 2026-12-20.
8. **Cut. Taste profile, public share page and Wrapped leave the 12-week test.** They are
   removed from the test entirely, not deferred to after 2026-12-20. Work on thumbs feedback
   stays frozen.

## Plan changes

The phases of the music-first ADR change as follows:

| Phase | Dates          | Change                                                                                                                               |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2     | 10-13 to 10-26 | Music-only commands, minimal invite and opt-out recap ship; uptime clock starts at the first off-box ping; no recruiting; no Wrapped |
| 3     | 10-27 to 11-22 | top.gg ads from 10-27 at the latest; Meta only if the landing page is live by 10-31; no recruiting; no Wrapped or taste profile      |
| 4     | 11-23 to 12-20 | Read 11-30: WAG under 12 means portfolio mode that day; otherwise decision 12-20                                                     |

## Alternatives considered

- **Automated channels replace the 40 hand recruits, with the cohort split read from
  `preferredLocale` and OAuth state** (amendment 2 as proposed), rejected by the owner. Recruiting
  is dropped in every form; the directories and top.gg are the only acquisition channels.
- **Move the taste profile and public share page after 2026-12-20** (amendment 8 as proposed),
  rejected by the owner in favor of removing them, and Wrapped, from the test entirely.
- **Start spend before the activation fixes ship**, rejected. With 28% of adds removed within 5
  minutes, paid installs would mostly measure the old onboarding.

## Consequences

- Without hand recruiting the cohort is smaller than the about 90 guilds the music-first ADR
  planned for, so the gates read with wider error bars. The 2026-11-30 portfolio trigger exists
  so a clearly failing test stops early instead of running on noise.
- With the cohort split cut, the Brazil-first rule of the music-first ADR (decision 6) has no
  measurement in this test. The Brazil question stays open after 2026-12-20 and needs its own
  measurement.
- Hiding non-music commands from the hosted bot does not remove them from the repository;
  self-hosters keep them, as decision 3 of the music-first ADR already does for extractors.
- An opt-out recap posts in a channel the server did not pick. The off button on the first card
  and the 5-play minimum are what keep it from reading as spam; the no-unsolicited-DMs guardrail
  of `2026-06-18-in-bot-growth.md` still applies.

## Revisit when

- Removals within 5 minutes are still above 15% on 2026-11-30 after decision 1 ships.
- Any guild reports the opt-out recap as unwanted posting.
- The 2026-11-30 read and the 2026-12-20 decision date.
