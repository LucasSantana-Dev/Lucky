import { supportSessionService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { IntervalScheduler } from './IntervalScheduler'

// Sweep for expired tickets every 5 minutes.
const DEFAULT_TICK_INTERVAL_MS = 5 * 60 * 1000

// Discord REST error code: the channel truly no longer exists.
const UNKNOWN_CHANNEL = 10003

/**
 * Auto-closes expired support tickets by deleting the channel and marking the
 * session closed. Critically, the session is closed **only when the channel is
 * confirmed gone** — a successful delete, or a `10003 Unknown Channel`. A
 * `50013 Missing Permissions` or a transient error leaves the session OPEN so a
 * later sweep retries; closing it there would orphan a still-live ticket channel
 * that nothing would ever clean up.
 */
export class SupportSessionScheduler extends IntervalScheduler {
    constructor(tickIntervalMs: number = DEFAULT_TICK_INTERVAL_MS) {
        super(tickIntervalMs)
    }

    /** Sweep once immediately on startup to catch tickets that expired while the
     * bot was down (matches the other IntervalScheduler subclasses). */
    protected onStart(): void {
        void this.tick()
    }

    protected async execute(): Promise<void> {
        if (!this.client) return

        const expired = await supportSessionService.getExpired()
        let closed = 0
        for (const session of expired) {
            if (await this.teardownTicket(session.id, session.channelId)) {
                closed++
            }
        }

        if (closed > 0) {
            infoLog({
                message: `Support ticket sweep: closed ${closed} expired ticket(s)`,
            })
        }
    }

    /**
     * Delete the ticket channel and close the session iff the channel is
     * confirmed gone. Returns true when the session was closed.
     */
    private async teardownTicket(
        sessionId: string,
        channelId: string,
    ): Promise<boolean> {
        if (!this.client) return false

        let channel
        try {
            channel = await this.client.channels.fetch(channelId)
        } catch (err) {
            if (errorCode(err) === UNKNOWN_CHANNEL) {
                return this.closeSession(sessionId) // already gone
            }
            // Transient/permissions fetch error — leave open, retry next sweep.
            errorLog({
                message: `Ticket sweep: could not fetch channel ${channelId}`,
                error: err,
            })
            return false
        }

        if (!channel || channel.isDMBased()) {
            return this.closeSession(sessionId) // not a live guild channel
        }

        try {
            await channel.delete('Support ticket expired')
            return this.closeSession(sessionId)
        } catch (err) {
            if (errorCode(err) === UNKNOWN_CHANNEL) {
                return this.closeSession(sessionId) // raced, already gone
            }
            // 50013 (missing perms) or transient — the channel still exists, so
            // keep the session OPEN and retry on a later sweep.
            errorLog({
                message: `Ticket sweep: could not delete channel ${channelId}, will retry`,
                error: err,
            })
            return false
        }
    }

    private async closeSession(sessionId: string): Promise<boolean> {
        try {
            await supportSessionService.close(sessionId)
            return true
        } catch (err) {
            errorLog({
                message: `Ticket sweep: failed to close session ${sessionId}`,
                error: err,
            })
            return false
        }
    }
}

function errorCode(err: unknown): number | undefined {
    return (err as { code?: number })?.code
}

/** Singleton instance of SupportSessionScheduler. */
export const supportSessionScheduler = new SupportSessionScheduler()
