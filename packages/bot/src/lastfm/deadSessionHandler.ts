import type { Client } from 'discord.js'
import { infoLog, warnLog, errorLog } from '@lucky/shared/utils'
import { lastFmLinkService } from '@lucky/shared/services'

/** Guard keyed by session key: a relink produces a new key, which gets a new DM. */
const notifiedSessionKeys = new Set<string>()
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
 * and a relinked-then-expired session still notifies.
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

    let row: Awaited<ReturnType<typeof lastFmLinkService.getByDiscordId>>
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

    const removed = await lastFmLinkService.unlink(discordId)
    if (!removed) {
        errorLog({
            message: 'Failed to remove invalid Last.fm session',
            data: { discordId, via },
        })
        return
    }

    infoLog({
        message: 'Removed invalid Last.fm session',
        data: { discordId, via },
    })

    if (notifiedSessionKeys.has(failedSessionKey)) return
    notifiedSessionKeys.add(failedSessionKey)
    try {
        const user = await client?.users.fetch(discordId)
        await user?.send(
            'Your Last.fm session on Lucky expired, so scrobbling has stopped. Relink any time with `/lastfm link`.',
        )
    } catch {
        // closed DMs or fetch failure — the unlink already happened
    }
}

/** Test-only: reset the per-process DM/env-warn guards. */
export function resetDeadSessionGuards(): void {
    notifiedSessionKeys.clear()
    envKeyWarned = false
}
