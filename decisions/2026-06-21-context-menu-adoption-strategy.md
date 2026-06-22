# Context-Menu (Apps) Command Adoption Strategy

- Date: 2026-06-21
- Status: accepted
- Deciders: Lucas Santana
- Related: `decisions/2026-06-21-move-message-context-menu.md` (first consumer)

## Context

Building "Move message" introduced a reusable **message** context-menu command
subsystem (model, loader, `client.contextMenus` collection, deploy-payload merge,
`isMessageContextMenuCommand` routing). With that infra paid for, the marginal
cost of giving _other_ existing slash commands a right-click trigger drops sharply,
so the question is which to convert and in what order — vs leaving them slash-only.

Inventory of the 75 slash commands by primary target:

- **8** take a USER option (ban, warn, kick, mute, unmute, history; cases/level optional).
- **2** already require the user to type/paste a **message ID** (`/giveaway end|reroll`,
  `/reactionrole delete`) — pure copy-an-ID friction a message menu removes outright.
- **~55** take no entity (music, config) — a context menu adds nothing.

VERIFIED FACTS:

- Discord allows up to **15 USER + 15 MESSAGE** context-menu commands per app
  (per guild and globally); 100 CHAT_INPUT. Source: Discord developer docs,
  https://docs.discord.com/developers/interactions/application-commands. Lucky has
  **0** context-menu commands today, so the cap is **not** a binding constraint
  (an earlier assumption of a 5-command cap was checked and refuted).
- Commands register per-guild on the bot `ready` event.

This decision was challenged by the `decision-critic` agent (verdict: ACCEPT). Its
load-bearing objection — that Tier-1 conversions assume demand without measuring it
— is incorporated below as an explicit gate.

## Decision

Adopt context-menu triggers **incrementally**, as a **supplement to** (never a
replacement of) the existing slash commands, with **one canonical handler per
action** shared by both surfaces so they cannot diverge (the context menu is a thin
trigger over the same logic).

Sequencing:

1. **NOW** — finish "Move message" (Message menu). Ship + test it first; it is the
   reference implementation and proves deploy + routing end-to-end.
2. **Tier 1 (next, highest ROI)** — the right-clicked entity is the command's only
   required input, so no extra input UI is needed:
    - MESSAGE menu: "End giveaway", "Reroll giveaway", "Delete reaction-role".
    - USER menu: "Mod history" (read-only). Needs a small USER-menu infra mirror
      (`UserContextMenuCommand` + `isUserContextMenuCommand` route).
    - **Gated** — see "Tier-1 gates" below.
3. **Tier 2 (later)** — unmute, view cases, view rank (user menus); "purge up to
   here" (message menu).
4. **Tier 3 (deferred)** — ban / kick / warn / mute as user menus. These need a
   free-text reason → require modal routing (`isModalSubmit`, context-menu → modal
   → action chain). Deferred behind (a) building modal routing and (b) a demand
   signal (mods asking for right-click moderation).
5. **Keep slash-only** — all config/music/general-info commands (no entity target).

### Tier-1 gates (added per critic reconciliation)

Before committing engineering time to any Tier-1 conversion:

- **Pre-gate (hard blocker):** the context-menu subsystem has unit + on-guild
  integration coverage and "Move message" is shipped and verified in ≥1 guild.
- **Gate A (demand):** query 7–30 day invocation counts for the underlying command
  (`/giveaway end`, `/giveaway reroll`, `/reactionrole delete`, `/history`).
  Convert only commands with non-trivial usage (≈≥5 invocations/week); for any
  below that, defer the conversion or confirm the friction with a real user/support
  signal first. Cost of the check is ~one telemetry query.

## Alternatives considered

- **Convert nothing (slash-only):** rejected — the 2 message-ID commands force
  users to copy IDs today; the infra now removes that friction cheaply.
- **Replace slash with context menus for converted actions:** rejected — context
  menus are less discoverable; slash is how users _find_ commands. Keep both.
- **Convert every entity-targeting command up front:** rejected — YAGNI; build
  Tier 1 behind the demand gate, let usage justify the rest.
- **Skip the demand gate for Tier 1 (cost is low):** rejected on critic input —
  "low cost + unknown demand" still favors _measure-then-build_ when the check is a
  5-minute query; near-zero downside is not the same as positive value.

## Consequences

Positive:

- Each conversion reuses existing tested logic; the new surface is a thin trigger.
- Serves both discovery (slash) and speed (right-click) without forcing a choice.
- The 15/15 cap is generous vs the realistic candidate set (~3 message + ~4 user).

Negative / risks:

- Dual surface = two entry points per converted action; mitigated by the single
  canonical-handler rule (code review must confirm no copy-pasted command logic).
- Context-menu UI can clutter; mitigated by keeping the set small and gated.
- A bug reachable only via the context-menu path (e.g. handler expects a slash
  option that the menu doesn't supply) — mitigated by integration tests that run
  both surfaces of the same action.

Neutral:

- USER-menu and modal routing are deferred infra increments, not built yet.

## Revisit when

- Context-menu usage for a converted action **dominates** its slash usage for 2+
  months → consider deprecating that slash variant to shrink surface.
- A Tier-1 candidate's underlying command shows **~zero** usage in telemetry →
  drop that conversion.
- **Tier-3 demand** appears (mods requesting right-click ban/kick) → build modal
  routing, then reopen the Tier-3 gate.
- Discord changes the 15/15 cap or context-menu semantics → re-evaluate curation
  pressure.
