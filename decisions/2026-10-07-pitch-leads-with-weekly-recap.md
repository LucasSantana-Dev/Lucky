# The pitch leads with the weekly recap; thumbs feedback moves onto the now-playing message

- Status: Accepted
- Date: 2026-10-07
- Deciders: Lucas Santana
- Amends: `2026-09-27-music-first-positioning.md` (decision 1, the pitch), as its positioning
  check prescribes. The three continuation gates and the 2026-12-20 decision date stand.
- Closes: #2658

## Context

The music-first ADR set a positioning check: if under 20% of active guilds use thumbs feedback,
drop "learns your taste" as the lead and lead with the weekly recap. The prod read on
2026-10-07 found 0 rows in `user_track_feedbacks` over 30 days, so the check fired (#2658).

Two facts found while preparing the decision make the 0% weaker evidence than it looks:

- Thumbs had no visible entry point. The now-playing message carries only playback controls
  (`packages/bot/src/utils/music/buttonComponents.ts`); the only way to like or dislike a track
  was typing `/recommendation feedback like|dislike`. The check measured discoverability, not
  whether listeners want to rate music.
- Feedback that was given barely reached autoplay: it was stored under a key that autoplay
  never looks up for decorated titles, multi-artist credits or accented letters (#2684).

The weekly recap itself is built (#2678: #2679, #2681), so leading with it is an executable
pitch, not a promise.

## Decision

1. **The pitch leads with the weekly recap.** New lead: "Every Sunday, Lucky shows your server
   what it listened to, and keeps the call playing in between, no DJ needed." Taste learning
   stays in the description as a supporting line, not the headline. Copy changes (README hero,
   top.gg listing #2472) land once `/recap` is live in production, so no surface advertises a
   feature users cannot run yet.
2. **Thumbs stays and becomes visible.** The now-playing message gets 👍 and 👎 buttons that
   write the same feedback as `/recommendation feedback`, with the key fixed (#2684) so a vote
   actually reaches autoplay scoring.
3. **Re-run the positioning check 28 days after the buttons deploy.** If 20% or more of active
   guilds then use thumbs, "learns your taste" may return as a co-lead next to the recap; if
   not, it stays a supporting line. Either result is recorded as an amendment here.

## Alternatives considered

- **Switch the pitch and leave thumbs as is**, rejected. It would keep a feature nobody can
  find while concluding nobody wants it.
- **Keep the pitch and only re-measure**, rejected. The check is the rule the music-first ADR
  set before the data came in; overriding it after the fact because the result is unwelcome
  would make the gates meaningless. The buttons fix the measurement for the next read instead.
- **Switch the pitch and remove thumbs**, rejected. Feedback feeds autoplay scoring
  (`replenisher.ts`, `candidateFallback.ts`), and the 0% says nothing about a version users
  can see.

## Consequences

- Autoplay scoring reads the feedback of the user who requested the track, so a 👍 from
  another listener is stored and counted for the positioning check but does not change that
  session's autoplay. Acceptable for now; revisit if the re-run shows real usage.
- The re-run uses the same definition of active guild as the music-first ADR (operator and
  test guilds excluded).
