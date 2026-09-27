# Lucky as a taste-learning music bot: one bounded 12-week test, decided 2026-12-20

- Status: Accepted
- Date: 2026-09-27
- Method: /deep-research (internal prod data + 5 market angles), /debate (5 lenses, rebuttal round,
  synthesis), operator decisions (bounded test, $50 budget)
- Amends: `2026-05-23-lucky-oss-positioning.md` (the product pitch only; its repo-governance
  decisions stand)

## Context

Growth is slow and the top.gg listing got almost no views. The question was how to gain
visibility and, eventually, monetize.

**Internal data** (Postgres, Loki, Prometheus, read 2026-09-27 15:03 UTC):

- 49 guilds present; 44 without the operator's, 38 without test guilds.
- 90-day cohort: 56 joined, 21 left within 24 hours, 27 still present, 17 ever used the bot,
  5 used it more than 7 days after joining. About 0.6 joins per day.
- 41 of 59 LEAVE events came within 1 hour of the JOIN, with the join onboarding embed from
  `2026-06-18-in-bot-growth.md` in place since #1506.
- Active non-operator guilds: 7 in 7 days, 17 in 30 days. Usage is almost only music: 15
  guilds, 465 tracks in 30 days, 43% autoplay. Moderation cases ever: 0.
- Active guilds are small (9 to 200 members) and international. Locale is not measurable;
  Lucky was never marketed in Brazil.
- No music recap exists. `WeeklyDigestService` is a community digest (top reactions, events,
  member count) and the moderation digest is opt-in (0 guilds configured), so Server Wrapped
  is a new build from `TrackHistory`.
- Audio: search is Spotify-first (`playerFactory.ts`, `play/youtubeHandler.ts`). Spotify
  gives metadata only, so the stream is bridged to SoundCloud (`play-dl`) and falls back to
  YouTube (`discord-player-youtubei`, `yt-dlp`). The share of plays actually streamed from
  YouTube is not measured yet.

**Market** (web research 2026-09-27; directory server counts disagree 2-3x):

- YouTube enforcement against music bots is ongoing and hits bots at scale: Groovy and Rythm
  (2021), Hydra and MEE6 music (2023), Vexera (July 2024, 3M+ servers). Rythm came back in
  2024 as a licensed Discord Activity, not a bot.
- Survivors price premium at $2-10/month for 24/7, extra instances and custom branding;
  filters, volume and playlists are free everywhere. No bot publishes revenue or conversion.
- Discord Premium Apps: developer countries US/UK/EU per secondary sources, Brazil likely not
  eligible (unverified at the primary page). Pricing-parity rule since 2024-10-07.
- Most cited reasons users remove a bot: it goes offline, basics behind a paywall, audio lag,
  Administrator permission (Lucky does not request it). Autoplay is table stakes; nobody
  markets taste learning or a server recap.
- No public benchmark exists for first-hour removal rates. The one public top.gg ad case: about
  $1.25 CPM, 1 invite per ~1,800 impressions, about $2.25 per added server.

## Decision

1. **Pitch:** "Lucky learns your server's taste and keeps the call playing, no DJ needed.
   Every Sunday, see what your server listened to." Audio sources are never advertised, in
   the top.gg listing, the App Directory or the README.
   Self-hosting is no longer promoted: the code stays open source (ISC) and a README section
   documents running your own copy as unsupported, with no support for setup, hosting or
   upgrades. Promoting self-hosting as the way to keep features the hosted bot turns off
   would read as evasion.
2. **Product focus:** keep music, autoplay, thumbs feedback, Spotify and Last.fm linking.
   Build a one-click station button for the first hour, Server Wrapped (new, from
   `TrackHistory`) and a per-server taste profile that does not expire. Hide moderation,
   automod, giveaways, logs, Twitch and custom commands from the hosted bot's onboarding
   and help. The dashboard stays as is.
3. **Audio posture:** the repository keeps every extractor for self-hosters. The hosted bot
   gets a `HOSTED_YOUTUBE_ENABLED` flag at extractor registration, with a CI test that runs
   with it off. The station button seeds from Radio Browser or SoundCloud, not YouTube.
   YouTube goes off on the hosted bot within 24 hours of the first of: 100 weekly active
   guilds, 1,000 installed guilds, or any notice from YouTube, Discord or top.gg.
4. **Monetization is off the roadmap.** No paid perks of any kind (Pix, Patreon, Premium Apps)
   while the hosted bot can stream YouTube. Only a GitHub Sponsors link with no perks. A paid
   tier needs both at least 300 weekly active guilds for 4 weeks and a YouTube-free mode that
   holds at least 50% of sessions; then it sells metadata features only (Wrapped, taste match,
   branding).
5. **Growth is one bounded test, budget $50.** Activation first, then one measurement cohort
   of about 90 new guilds: about 20 from a $50 top.gg ad run, about 40 recruited by hand (25
   pt-BR, 15 international), plus organic joins and free directories (discordbotlist,
   discords.com via BotBlock). The ad spend is a measurement cost, not a channel.
6. **pt-BR is settled by data:** Lucky goes Brazil-first after the decision date only if the
   pt-BR cohort's day-8 retention is at least 1.5x the rest AND at least 6 pt-BR guilds are
   active on day 8. With about 25 guilds the ratio alone is noise (95% CI about +/-14
   points), so the absolute floor is required.
7. **Watch-together (Go Live style) is out.** The only compliant design embeds the official
   YouTube player, which shows the same ads as Discord's native Watch Together.

## Plan

| Phase | Dates               | Work                                                                                                                                                          |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 2026-09-28 to 10-04 | README and top.gg copy without evasion wording or dev tags (#2472); Sponsors link; verify Premium Apps eligibility for Brazil and Pix sales under MEI by hand |
| 1     | 10-05 to 10-12      | One release: telemetry incl. real stream source (#2471), station button (#2473), `HOSTED_YOUTUBE_ENABLED`, hide non-music commands                            |
| 2     | 10-13 to 10-26      | Uptime gate: 14 days at 99% or better via external ping; start recruiting; start Wrapped; free directories                                                    |
| 3     | 10-27 to 11-22      | $50 top.gg ads; finish recruiting; Wrapped and taste profile shipped by 11-22                                                                                 |
| 4     | 11-23 to 12-20      | Interim read 11-30; decision 12-20                                                                                                                            |

"Active guild" in every metric below excludes the operator's guilds, test-named guilds and
the Discord Bots listing server (the 38-guild base of the diagnosis).

**Continue on 2026-12-20 only if all hold:** 20 or more weekly active non-operator guilds for
3 consecutive weeks; 35% or more of new guilds hear a track within their first hour; 15% or
more of new guilds still active on day 8; 20% or more of active guilds used thumbs feedback
(otherwise drop the "learns your taste" pitch). Continue means App Directory, the Brazil
decision and a YouTube-free mode. Otherwise Lucky moves to portfolio mode: about 2 hours a
week of maintenance and a published case study by 2027-01-31.

## Consequences

- The guardrails of `2026-06-18-in-bot-growth.md` still apply: no unsolicited DMs, no invite
  rewards, no core features behind votes.
- With a $50 budget the ad share of the cohort is small (about 20 guilds at the one published
  cost figure), so hand recruiting carries the sample. At about 90 guilds, proportions read
  within roughly +/-10 points: enough for the go/no-go thresholds, not for fine comparisons.
- The README leads with adding the hosted bot; it no longer claims Lucky "can't be shut
  down", no longer names audio sources, and drops the "Why Self-Host?" section.

## Alternatives considered

- **Free music bot, monetize at ~30 weekly active guilds** (first version of this ADR):
  rejected. 30 guilds is about one paying server, and paid perks on a YouTube-streaming bot
  strengthen a commercial-use claim.
- **Go YouTube-free now (FlaviBot model):** rejected for now; it could remove most of the
  playback people use today. Revisit when the stream-source metric exists.
- **Brazil-first now:** rejected; no usage evidence yet. Settled by the pt-BR cohort instead.
- **Portfolio mode now:** rejected by the operator in favor of one bounded test; it remains
  the fallback.
- **Paid acquisition as a channel:** rejected; about $2.25 per add with this retention does
  not pay back.

## Revisit when

- The stream-source metric shows YouTube carries most plays (plan the YouTube-free mode
  earlier) or very few (turn it off early).
- Any YouTube shutoff trigger in point 3 fires.
- The 2026-12-20 decision date.
