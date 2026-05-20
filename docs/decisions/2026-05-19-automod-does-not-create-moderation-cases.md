---
status: accepted
date: 2026-05-19
---

# AutoMod actions do not create Moderation Cases

AutoMod runs without a moderator in the loop and currently does not write to `ModerationCase`. Manual Moderation Actions (warn / mute / kick / ban / lockdown / slowmode / purge) write a `ModerationCase` row with case number, reason, duration, and an appeal trail; AutoMod hits do not.

This is deliberate, not a missing feature. AutoMod handles high-volume, low-judgement enforcement (spam, caps, banned-words, link blocks) where every triggered action would inflate the Case table and dilute the appeal flow, which is designed around moderator-reviewable decisions.

## Considered options

- **Unified Cases for AutoMod and manual Moderation.** Rejected: floods the case audit trail with low-signal automatic hits, makes appeals less meaningful, and forces appeal-flow UX on enforcement decisions where appeal isn't appropriate.
- **Separate "AutoMod Hit" table mirroring Cases.** Rejected for now: no current consumer needs that data shape. AutoMod logs are sufficient for tuning rules; Sentry covers operational visibility.
- **Status quo: AutoMod writes nothing case-shaped.** Accepted.

## Consequences

- A moderator looking at a Member's `cases` history will not see AutoMod-triggered actions. If that becomes a real gap, surface it via a separate AutoMod-hit log rather than fusing the tables.
- "Member case count" metrics reflect _moderator-issued_ actions only; this is the correct baseline for moderation-load dashboards but must be disclosed in any user-facing transparency report.
- Reversing this decision later means a schema migration (either add fields to `ModerationCase` to disambiguate source, or introduce a separate `AutoModHit` table) plus rework of the appeal UI to handle the AutoMod path.
