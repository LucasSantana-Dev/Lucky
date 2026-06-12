# Logging

Lucky uses shared logging utilities that forward errors to Sentry for observability. This document describes correct usage and a common footgun to avoid.

## The logging utils

The shared logging layer (`packages/shared/src/utils/general/log/`) exports four main functions:

- **`errorLog(params)`** — logs an error and sends it to Sentry; call when an exceptional condition occurs.
- **`warnLog(params)`** — logs a warning and adds a breadcrumb; use for expected fallbacks or degradation.
- **`infoLog(params)`** — logs informational messages; adds a breadcrumb.
- **`debugLog(params)`** — logs debug-level messages; respects the configured log level.

All accept a `LogParams` object:

```typescript
type LogParams = {
    message: string          // Required: human-readable message
    error?: unknown          // Optional: the caught exception or error object
    data?: unknown           // Optional: structured context (guildId, userId, etc.)
    correlationId?: string   // Optional: request or operation id for tracing
}
```

## The footgun: errorLog without the error object

Calling `errorLog({ message: "..." })` with only a message (omitting the `error` property) **silently sends a message event instead of an exception event** — the severity stays `error`, but the exception object and stack trace are lost.

The service checks whether `params.error` exists (line 106 in `service.ts`):

- **If `error` is present**: calls `captureException()` → Sentry receives a full exception with stack.
- **If `error` is absent**: calls `captureMessage()` with level `'error'` → **Sentry receives a message, not an exception**, and the context is much weaker for debugging.

## Correct pattern

Always include the error object when calling `errorLog`:

```typescript
// ✅ CORRECT — Sentry captures the full exception + stack
try {
    await spotifyApi.search(query)
} catch (err) {
    errorLog({
        message: 'Spotify search failed',
        error: err,
        data: { query, guildId: ctx.guildId }
    })
    return fallback
}
```

```typescript
// ❌ INCORRECT — Sentry records only a message; stack is lost
catch (err) {
    errorLog({
        message: 'Spotify search failed'
    })
    return fallback
}
```

For expected fallbacks (e.g., feature-toggle off, timeout, retrying), use `warnLog` instead:

```typescript
// ✅ CORRECT for degradation
if (!featureToggle.enabled) {
    warnLog({ message: 'Feature disabled, using fallback' })
    return fallback
}
```

## Structured context

Include relevant IDs and state in the `data` field for better debugging:

```typescript
errorLog({
    message: 'Discord API rate-limited',
    error: err,
    data: {
        guildId: guild.id,
        userId: user.id,
        operation: 'getUserGuilds',
        retryAfter: err.response?.headers?.['retry-after']
    }
})
```

## Related decision

See ADR [2026-06-01 — logging-observability-hardening](../decisions/2026-06-01-logging-observability-hardening.md) for the full logging strategy, including silent-catch enforcement (ESLint rule) and request-id threading.
