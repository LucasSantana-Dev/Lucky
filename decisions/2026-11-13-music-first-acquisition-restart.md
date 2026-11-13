# Music-first test: the acquisition phase never ran, so it restarts and every read moves 4 weeks

- Status: Accepted
- Date: 2026-11-13
- Deciders: Lucas Santana
- Method: read of prod data (Postgres, backend logs) against the gates of
  `2026-09-27-music-first-positioning.md`; owner decision to postpone instead of entering
  portfolio mode on 2026-11-30
- Amends: `2026-09-27-music-first-positioning.md` (the plan dates and the decision date) and
  `2026-10-18-music-first-business-review-amendments.md` (decision 5, the WAG windows, and
  decision 7, the portfolio trigger date). The three continuation gates, their thresholds and
  every other decision stand. Hand recruiting stays cut (decision 2 of the 2026-10-18 amendment).

## Context

The test was meant to put a cohort of new guilds through the activation fixes and read the
gates on it. The activation fixes shipped. The acquisition channels of the 2026-10-18 amendment
did not run:

- top.gg ads (#2756, due 2026-10-27), Meta Ads (#2757) and the directory listings (#2751) are
  still open with no activity.
- `guild_join_sources` has 0 rows. The backend logged 13 `/invite` clicks in the last 16 days
  (4 `github`, 1 `reddit`, 8 with no source).
- 23 guilds joined since 2026-10-01, against the about 90 the music-first ADR planned for; 3 of
  them in the two weeks to 2026-11-13.
- `activation_events` has not recorded onboarding since 2026-10-29 (#2993), so the funnel of the
  joins after that date cannot be read.

Read on 2026-11-13 with `scripts/music-first-gates.sql` (its definitions and exclusions, with
the window moved to the recent weeks): WAG 11, 8 and 9 for the closed weeks starting 2026-10-19,
10-26 and 11-02, and 8 so far for the week of 11-09, which was still open. Cohort of the last 28
days: 12 counted joins, 7 of 12 heard a track in the first hour (58%, gate 35%), 3 of 11 active
on day 8 (27%, gate 15%). Existing guilds grew: plays requested by people +25% and requesting
users 6 to 10, week over week.

The two activation gates pass on a cohort of 12 joins. The WAG gate needs about twice the guilds
active today, and at 1 or 2 joins a week it cannot get there.

A portfolio verdict on 2026-11-30 would measure a test with no cohort, not the product.

## Decision

1. **The acquisition phase restarts on 2026-11-16 and runs to 2026-12-20**, with the channels
   of the 2026-10-18 amendment: top.gg ads (#2756), the free directories (#2751) and, at the
   owner's call, Meta Ads (#2757). Meta's prerequisite in that amendment, a landing page live by
   2026-10-31, is met: the landing with source attribution shipped on 2026-10-18 (#2851). No hand
   recruiting.
2. **Measurement is fixed in the first week.** `activation_events` records onboarding again
   (#2993) and one join is seen end to end in `guild_join_sources` before money is spent.
3. **Every read moves 4 weeks.**

| Item                                        | Was                                | Now                                |
| ------------------------------------------- | ---------------------------------- | ---------------------------------- |
| WAG windows (weeks ending)                  | 2026-11-29, 2026-12-06, 2026-12-13 | 2026-12-27, 2027-01-03, 2027-01-10 |
| Read: WAG under 12 means portfolio that day | 2026-11-30                         | 2026-12-28                         |
| Continue or portfolio decision              | 2026-12-20                         | 2027-01-17                         |
| Portfolio case study, if portfolio          | 2027-01-31                         | 2027-02-28                         |

## Alternatives considered

- **Portfolio mode now.** Rejected by the owner: the gates would read a cohort that was never
  acquired.
- **Bring hand recruiting back.** Not taken. The owner cut it on 2026-10-18 and it is the one
  channel only the owner can run.

## Consequences

- The WAG windows now cover Christmas and New Year, when Discord use is atypical. The read on
  2026-12-28 should be checked against the plays of the weeks before it.
- Another 4 weeks of owner time goes to the test before the portfolio question is answered.
- Without recruiting, the cohort depends on paid and directory traffic, which had no measured
  result so far. If those channels bring under 10 joins by 2026-12-20 the gates cannot pass,
  whatever the product does.

## Revisit when

- The channels bring under 10 joins by 2026-12-20.
- `guild_join_sources` is still empty after the first ad week.
- The read on 2026-12-28 and the decision on 2027-01-17.
