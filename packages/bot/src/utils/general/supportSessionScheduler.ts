import { supportSessionService } from '@lucky/shared/services'
import { errorLog, infoLog } from '@lucky/shared/utils'
import { IntervalScheduler } from './IntervalScheduler'

// Sweep for expired tickets every 5 minutes.
const DEFAULT_TICK_INTERVAL_MS = 5 * 60 * 1000

// Discord REST error codes treated as "already gone", not a failure.
const UNKNOWN_CHANNEL = 10003
const MISSING_PERMISSIONS = 50013

/**
 * Auto-closes expired support tickets: deletes the channel (the single-step
 * teardown the overwrite-based design enables) and marks the session closed.
 * A missing channel or a permissions error is treated as already-gone so the
 * record is still closed and the sweep doesn't retry it forever.
 */
export class SupportSessionScheduler extends IntervalScheduler {
    constructor(tickIntervalMs: number = DEFAULT_TICK_INTERVAL_MS) {
        super(tickIntervalMs)
    }

    protected async execute(): Promise<void> {
        if (!this.client) return

        const expired = await supportSessionService.getExpired()
        for (const session of expired) {
            const channel = await this.client.channels
                .fetch(session.channelId)
                .catch(() => null)

            if (channel && !channel.isDMBased()) {
                try {
                    await channel.delete('Support ticket expired')
                } catch (err) {
                    const code = (err as { code?: number })?.code
                    if (
                        code !== UNKNOWN_CHANNEL &&
                        code !== MISSING_PERMISSIONS
                    ) {
                        errorLog({
                            message: `Failed to delete expired ticket channel ${session.channelId}`,
                            error: err,
                        })
                    }
                }
            }

            // Close the record regardless — the channel is gone (or already was).
            await supportSessionService.close(session.id).catch((err) =>
                errorLog({
                    message: `Failed to close ticket session ${session.id}`,
                    error: err,
                }),
            )
        }

        if (expired.length > 0) {
            infoLog({
                message: `Support ticket sweep: closed ${expired.length} expired ticket(s)`,
            })
        }
    }
}

/** Singleton instance of SupportSessionScheduler. */
export const supportSessionScheduler = new SupportSessionScheduler()
