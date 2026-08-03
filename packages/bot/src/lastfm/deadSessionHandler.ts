import type { Client } from 'discord.js'
import { infoLog, warnLog } from '@lucky/shared/utils'
import { lastFmLinkService } from '@lucky/shared/services'

const notifiedUsers = new Set<string>()
let envKeyWarned = false

/**
 * Handles a Last.fm error-9 (invalid session key) from a scrobble path.
 *
 * Only unlinks + notifies when the dead key came from a `lastfm_links` row.
 * When no row exists the failed key is the env LASTFM_SESSION_KEY fallback:
 * there is nothing to unlink and nobody to DM, so it logs a distinct config
 * warning (once per process) and returns.
 *
 * The DM is guarded by an in-memory set rather than the unlink result —
 * unlink() returns true even when the row was already gone (P2025), which
 * would double-DM when updateNowPlaying and scrobble race for one track.
 */
export async function handleDeadLastFmSession(
    discordId: string | undefined,
    client: Client | null,
    via: string,
): Promise<void> {
    if (!discordId) return

    const row = await lastFmLinkService.getByDiscordId(discordId)
    if (!row) {
        if (!envKeyWarned) {
            envKeyWarned = true
            warnLog({
                message:
                    'Last.fm env LASTFM_SESSION_KEY is invalid — check deployment config',
                data: { via },
            })
        }
        return
    }

    await lastFmLinkService.unlink(discordId)
    infoLog({
        message: 'Removed invalid Last.fm session',
        data: { discordId, via },
    })

    if (notifiedUsers.has(discordId)) return
    notifiedUsers.add(discordId)
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
    notifiedUsers.clear()
    envKeyWarned = false
}
