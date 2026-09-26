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

## Output format: pretty (local) vs json (production)

Locally the logger prints the existing multi-line, colourised format. In
production (`NODE_ENV=production`), or whenever `LOG_FORMAT=json` is set
explicitly, each log call instead writes **exactly one stdout line**: the
`[LEVEL]` token (unchanged, used by promtail's level regex), followed by a
single-line JSON object.

```
[INFO] {"ts":"2026-09-26T12:00:00.000Z","level":"info","msg":"Guild joined","guildId":"110373943822540800"}
```

`correlationId`, `guildId` and `userId` are top-level keys (omitted when not
set) instead of being buried inside `data`, and an attached error becomes an
`error: { name, message, stack }` object with the stack's newlines escaped as
`\n` rather than split across physical lines. This fixes #2386: one log call
is now one Loki entry, not one entry per pretty-printed line.

Override the default with `LOG_FORMAT=pretty` or `LOG_FORMAT=json` in any
environment.

## Querying in Grafana (LogQL)

Every json-format line starts with the `[LEVEL] ` token before the JSON
object, so a query first strips that prefix with `regexp` + `line_format`,
then parses the remainder with `| json`:

```logql
# All logs for one guild
{container_name="lucky-bot"} | regexp "^\\[\\w+\\] (?P<body>.*)$" | line_format "{{.body}}" | json | guildId="123"
```

```logql
# Errors only, filtered by the nested error message (| json flattens
# error.message to error_message)
{container_name="lucky-bot"} | regexp "^\\[ERROR\\] (?P<body>.*)$" | line_format "{{.body}}" | json | error_message=~".*rate.limit.*"
```

```logql
# Trace one request end to end across the backend by correlationId
{container_name="lucky-backend"} | regexp "^\\[\\w+\\] (?P<body>.*)$" | line_format "{{.body}}" | json | correlationId="req-abc-123"
```

## Related decision

See ADR [2026-06-01 — logging-observability-hardening](../decisions/2026-06-01-logging-observability-hardening.md) for the full logging strategy, including silent-catch enforcement (ESLint rule) and request-id threading. See also [2026-06-16 — info-log-aggregation-loki](../decisions/2026-06-16-info-log-aggregation-loki.md) and #2386 for the single-line json output format.
