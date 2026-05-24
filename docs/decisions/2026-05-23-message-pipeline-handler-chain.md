# ADR: Replace messageHandler Kitchen-Sink with a MessagePipeline Chain

**Date:** 2026-05-23  
**Status:** Accepted

## Context

`packages/bot/src/handlers/messageHandler.ts` (322 LOC) is a single Discord `messageCreate` listener that sequentially runs:

- AutoMod enforcement
- Spam detection
- CustomCommand matching
- XP/leveling reward

These four concerns share no state but are hard-coupled in a single function. Consequences:

1. **Implicit ordering.** AutoMod can delete a message, but the remaining concerns still run — there is no early-exit contract.
2. **Test isolation is impossible.** Testing XP leveling requires mocking `AutoModService`, `CustomCommandService`, and spam detection, because they all live in the same function scope.
3. **Feature toggle checks are inline.** If the DB is down during the `isEnabled()` check, AutoMod silently skips. The fallback behaviour is not visible at the handler level.
4. **Adding a new concern** (e.g., birthday detection) means editing the existing function rather than adding a new handler alongside it.

## Decision

Replace the monolithic handler with a `MessagePipeline` that runs an ordered list of typed message handlers:

```typescript
interface MessageHandler {
    name: string
    canHandle(message: Message, context: MessageContext): Promise<boolean>
    handle(
        message: Message,
        context: MessageContext,
    ): Promise<MessageHandlerResult>
}

interface MessageHandlerResult {
    stop: boolean // true = do not run subsequent handlers
}
```

A `MessagePipeline` runs handlers in declared order. Each handler's `canHandle()` guard is responsible for the feature-toggle check (one place per concern). If any handler returns `stop: true`, the pipeline halts. The four current concerns become four `MessageHandler` implementations: `AutoModHandler`, `SpamHandler`, `CustomCommandHandler`, `XpHandler`.

`MessageContext` is a value object built once per message: resolved `Guild`, `Member`, `GuildSettings`, and the feature-toggle map for the message's Guild.

## Alternatives Considered

**Event bus (publish/subscribe).** Rejected: an event bus decouples producers from consumers but makes ordering non-deterministic. AutoMod must run before XP leveling (a deleted message should not grant XP). Explicit ordered chains preserve the ordering contract.

**Keep as-is, just add more functions.** Rejected: compounds the existing isolation problem; every new concern inherits the full mock surface of every prior concern.

**Move to a Saga / state machine.** Rejected: over-engineered for a linear pipeline. The chain pattern (as used in Express middleware) is well-understood, simpler, and sufficient.

## Consequences

**Positive:**

- Each handler's unit test only needs its own mocks — no cross-concern leakage.
- Adding a new concern is a new file; `messageHandler.ts` (which becomes `messagePipeline.ts`) is never edited.
- The `stop: true` contract makes AutoMod's early-exit explicit and testable.
- Feature-toggle failures are isolated to each handler's `canHandle()` — a DB outage in AutoMod doesn't affect XP leveling.

**Negative:**

- More files (one per handler + pipeline runner).
- `MessageContext` becomes a new type to maintain as new fields are needed.
- Ordering is now configuration, not code — developers must know where to insert a new handler in the chain.

## Revisit When

- A handler needs to communicate state to a later handler (e.g., AutoMod detection result used by XP). Extend `MessageContext` to carry it.
- The number of message handlers exceeds ~10 (consider a priority-sorted registry instead of a static array).
