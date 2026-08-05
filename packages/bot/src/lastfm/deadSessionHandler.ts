import type { Client } from 'discord.js'
import { LRUCache } from 'lru-cache'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { lastFmLinkService, type LastFmLinkRow } from '@lucky/shared/services'

/**
 * DM-dedup guard keyed by session key: a relink produces a new key, which
 * gets a new DM. Bounded so long-lived processes don't retain every expired
 * key (credential-like values) forever.
 */
const notifiedSessionKeys = new LRUCache<string, true>({ max: 500 })
let envKeyWarned = false

interface DeadSessionOptions {
    /** True when the failed key came from the env LASTFM_SESSION_KEY fallback. */
    envFallbackUsed: boolean
    /** Scrobble path label for logs (e.g. 'scrobble', 'externalScrobbler'). */
    via: string
}

function warnEnvKeyOnce(via: string): void {
    if (envKeyWarned) return
    envKeyWarned = true
    warnLog({
        message:
            'Last.fm env LASTFM_SESSION_KEY is invalid — check deployment config',
        data: { via },
    })
}

/**
 * Handles a Last.fm error-9 (invalid session key) from a scrobble path.
 *
 * Guards, in order:
 *  1. lookup failure → warn and bail (a DB error must not read as "env key")
 *  2. no row → env key if envFallbackUsed, else a concurrent path already
 *     unlinked; nothing to do
 *  3. row.sessionKey !== failedSessionKey → the failure is stale (user
 *     relinked since); never unlink the fresh key
 *  4. unlink failure → error log; the DM guard is NOT consumed so a later
 *     failure can still notify
 *
 * The DM is guarded per session key, not per user and not by the unlink
 * result (P2025 = true), so updateNowPlaying/scrobble races cannot double-DM
 * and a relinked-then-expired session still notifies. Delivery itself is
 * best-effort, at-most-once per session key: once unlinked, no later call
 * can re-enter this function for that key to retry a failed send.
 */
export async function handleDeadLastFmSession(
    discordId: string | undefined,
    failedSessionKey: string,
    client: Client | null,
    options: DeadSessionOptions,
): Promise<void> {
    const { envFallbackUsed, via } = options

    if (!discordId) {
        if (envFallbackUsed) warnEnvKeyOnce(via)
        return
    }

    let row: LastFmLinkRow | null
    try {
        row = await lastFmLinkService.getByDiscordId(discordId)
    } catch (error) {
        warnLog({
            message: 'Last.fm dead-session lookup failed — skipping cleanup',
            data: { discordId, via, error: String(error) },
        })
        return
    }

    if (!row) {
        if (envFallbackUsed) warnEnvKeyOnce(via)
        return
    }

    if (row.sessionKey !== failedSessionKey) return

    // Atomic conditional delete: closes the window between the read above
    // and the delete — a relink landing in between changes the key, so this
    // no-ops and the fresh link survives.
    const result = await lastFmLinkService.unlinkIfKeyMatches(
        discordId,
        failedSessionKey,
    )
    if (result !== 'removed') {
        // 'stale' = a racing path already cleaned up (expected no-op);
        // 'error' = the service already logged the database failure.
        return
    }

    infoLog({
        message: 'Removed invalid Last.fm session',
        data: { discordId, via },
    })

    // Reserve synchronously so concurrent handlers for the same key cannot
    // double-send. Releasing on delivery failure is a defensive no-op, not
    // an active retry: the row is already gone by this point, so no later
    // call for this session key can re-enter this function. Delivery here
    // is best-effort, at-most-once, not guaranteed-once.
    if (notifiedSessionKeys.has(failedSessionKey)) return
    notifiedSessionKeys.set(failedSessionKey, true)
    try {
        const user = await client?.users.fetch(discordId)
        await user?.send(
            'Your Last.fm session on Lucky expired, so scrobbling has stopped. Relink any time with `/lastfm link`.',
        )
    } catch {
        // closed DMs or fetch failure — the unlink already happened
        notifiedSessionKeys.delete(failedSessionKey)
    }
}

/** Test-only: reset the per-process DM/env-warn guards. */
export function resetDeadSessionGuards(): void {
    notifiedSessionKeys.clear()
    envKeyWarned = false
}
