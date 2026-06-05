# ADR: Extract ArtistSuggestionService from the artists Route Handler

**Date:** 2026-05-23  
**Status:** Accepted

## Context

`packages/backend/src/routes/artists.ts` (586 LOC) handles the `/artists` HTTP endpoints. It directly contains:

- Spotify artist search (`searchSpotifyArtists`, `getSpotifyRelatedArtists`)
- Redis caching (`FALLBACK_SUGGESTIONS_CACHE_KEY`, `USER_TOP_ARTISTS_CACHE_PREFIX`)
- A hardcoded array of 80+ popular artist names used as a last-resort fallback
- Batch preference handling and artist deduplication logic
- Direct `getPrismaClient()` calls

This makes the route handler 586 LOC — the largest file in `packages/backend/src/routes/`. The business logic (three-tier artist lookup: user preferences → Spotify → static fallback) is untestable without spinning up Express, mocking Redis, and mocking the Spotify client.

Additionally, the bot has no way to call the same "suggest artists" logic — if a slash command ever needs it, the logic would be duplicated.

## Decision

Extract an `ArtistSuggestionService` (in `packages/backend/src/services/`) that owns the three-tier artist lookup:

```
Tier 1: User's saved preferences (UserArtistPreference, from Prisma)
Tier 2: Spotify personalised suggestions (searchSpotifyArtists, getSpotifyRelatedArtists)
Tier 3: Static popular fallback list (loaded from config, not hardcoded in the route)
```

The service accepts a `discordUserId` and optional `guildId`, returns `ArtistSuggestion[]`. It owns the caching contract (what TTL, what cache key structure). The route handler becomes a thin HTTP adapter: parse request → call service → format response.

Move the 80+ hardcoded popular artist names to `packages/backend/src/config/popularArtists.ts` (a typed constant, not a runtime dependency).

## Alternatives Considered

**Move into `packages/shared`.** Deferred: the service depends on `SpotifyLink` (Account Link) and Redis, which are backend-only concerns. If the bot ever needs artist suggestions, the right approach is a shared interface with a backend implementation, not moving the backend service to shared.

**Keep as-is, just add tests via supertest.** Rejected: integration tests at the route level still require Redis and Spotify mocks and don't isolate the business logic from the HTTP plumbing.

## Consequences

**Positive:**

- `ArtistSuggestionService` tests: pure unit tests mocking only Spotify client + Prisma. No Express.
- Route handler shrinks from ~586 LOC to ~50 LOC.
- Hardcoded fallback list becomes a versioned config constant, easy to update without code changes.
- Paves the way for bot slash commands to call the same service (via a shared interface, if/when needed).

**Negative:**

- One additional service class to maintain.
- Caching logic moves from "invisible in the route" to "explicit in the service" — requires documenting the cache invalidation contract.

## Revisit When

- The bot needs artist suggestion logic (promotes `ArtistSuggestionService` to `packages/shared` with a `DiscordWriteAdapter`-style port).
- Spotify Account Link is deprecated or replaced.
