# Lucky Command and Feature Roadmap (Benchmarked)

This roadmap maps Lucky's next bot-first command/features against mature patterns from
Dyno, Rythm, Loritta, MEE6, and Carl-bot. It is reliability-first and incremental.

## Benchmark Sources

- Dyno docs: https://docs.dyno.gg/en
- Dyno listing (module surface): https://top.gg/bot/155149108183695360
- Rythm commands: https://rythm.fm/docs/commands
- Loritta listing/features: https://top.gg/bot/297153970613387264
- MEE6 features: https://mee6.xyz/en/features
- Carl-bot docs: https://docs.carl.gg/

## Delivery Principles

- Bot-first: slash commands and bot-side behavior first, dashboard support only when required.
- Reliability-first: playback and moderation safety before growth features.
- One command per PR: isolate blast radius and make CI/review/rollback simple.
- No contract breaks: additive commands and metadata fields only.

## Prioritized Command Matrix

Status legend: ✅ shipped · ⏳ in progress · ⏸ deferred

| Status | Priority | Command/Feature                                   | Inspired by                          | User Value                                         | Complexity                | Dependencies                              | Acceptance Criteria                                                                       |
| ------ | -------- | ------------------------------------------------- | ------------------------------------ | -------------------------------------------------- | ------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| ✅     | P0       | `/music health`                                   | Dyno module diagnostics              | Faster incident triage for moderators              | S                         | Player state + provider metrics           | Reports queue state, provider status, last recovery action, and voice connection state    |
| ✅     | P0       | Music watchdog auto-recovery                      | Rythm reliability expectations       | Fewer dead/stalled sessions                        | M                         | Player lifecycle hooks + retry policy     | Stalled playback auto-recovers in >=95% simulated failure scenarios                       |
| ✅     | P0       | Provider health cooldown                          | Rythm multi-source behavior          | Avoids repeated source failures                    | M                         | Extractor telemetry + Redis TTL           | Failing provider enters cooldown and fallback provider succeeds without user intervention |
| ✅     | P0       | Queue snapshot restore                            | Dyno-style resiliency expectations   | Survives reconnect/restart without losing sessions | M                         | Redis persistence + queue serializer      | Queue restores after reconnect/restart with current track + next entries intact           |
| ✅     | P1       | `/recommendation feedback like\|dislike`          | Music bots with feedback loops       | Better autoplay relevance                          | M                         | Redis feedback store + recommendation pipeline | Disliked tracks are not replayed during TTL window unless pool exhausted             |
| ✅     | P1       | Recommendation diversity constraints              | Rythm autoplay depth                 | Reduces repetitive autoplay streaks                | M                         | Track history + dedupe windows            | No same-track repeats in cooldown and no near-duplicate artist streaks in normal pools    |
| ✅     | P1       | Recommendation reason tags (`why this`)           | Spotify-like explainability patterns | Builds trust in autoplay choices                   | S                         | Recommendation metadata + embed updates   | Now playing and queue output expose reason tags for recommended tracks                    |
| ✅     | P1       | `/queue rescue`                                   | Dyno utility module style            | One-shot recovery for broken queues                | S                         | Queue validator + recommendation fallback | Removes unplayable entries and refills queue when below threshold                         |
| ✅     | P2       | `/queue smartshuffle`                             | Rythm queue ergonomics               | Better shuffle flow for group listening            | M                         | Weighted randomizer + requester history   | Shuffle preserves energy flow and avoids same-user streaks above configured threshold     |
| ✅     | P2       | `/session save\|restore\|list\|delete`            | Event/session utility patterns       | Long listening sessions become reusable            | M                         | Redis snapshots + permission checks       | Named-session save/restore now ships with autocomplete + 10-session-per-guild cap         |
| ⏸     | P2       | `/playlist collaborative`                         | Loritta/MEE6 community collaboration | Shared curation for communities                    | L                         | Per-user quota rules + queue policy       | Service-side limits already enforced via collaborativePlaylistService; deferred command surface |
| ✅     | P2       | Moderation automation presets (`/automod preset`) | Dyno/Carl automod modules            | Faster secure setup for new servers                | M                         | AutoModService rule packs                 | Applying a preset creates validated rules for spam/link/mention abuse                     |
| ✅     | P2       | `/mod digest` weekly summary                      | Dyno moderation reporting            | Better moderation visibility                       | S                         | Case aggregation + scheduler              | On-demand `/digest view` and opt-in scheduled `/digest schedule` both shipped (v2.6.64)   |
| ✅     | P2       | Engagement utilities (`/starboard`, `/level`)     | MEE6/Loritta engagement layer        | Higher server retention                            | L                         | Message event pipeline + storage          | Commands expose leaderboard/state with role-safe configuration                            |

## Next 6 Weeks (Locked Order)

### Weeks 1-2: Reliability Core

1. `/music health`
2. Music watchdog auto-recovery
3. Provider health cooldown
4. Queue snapshot restore

### Weeks 3-4: Autoplay Intelligence V2

1. `/recommendation feedback like|dislike`
2. Recommendation diversity constraints
3. Recommendation reason tags
4. `/queue rescue`

### Weeks 5-6: High-Value UX

1. `/queue smartshuffle`
2. `/session save`
3. `/session restore`
4. `/playlist collaborative`

## Rollout Guide (One Command per PR)

For each roadmap item:

1. Create one branch (`feature/<command-or-capability>` or `fix/<capability>`).
2. Implement only that command/feature plus required tests.
3. Update `README.md` and `CHANGELOG.md` in the same PR.
4. Run package-targeted tests first, then monorepo lint/type-check/test gates.
5. Merge only after required checks are green and code review findings are resolved.

Recommended PR order follows the 6-week sequence above.
