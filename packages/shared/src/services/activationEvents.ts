import type { ActivationEventKind } from '../constants/invite'
import { getPrismaClient } from '../utils/database/prismaClient'
import { warnLog } from '../utils/general/log'

const SNOWFLAKE = /^\d{17,20}$/
const MAX_REASON_LENGTH = 64

/**
 * Record one activation funnel step (`activation_events`). Fire-and-forget by
 * contract: it never throws, so a failed insert cannot break onboarding,
 * playback or a button reply. Returns true only when a row was written; a
 * guild id that is not a snowflake writes nothing.
 */
export async function recordActivationEvent(
    guildId: unknown,
    kind: ActivationEventKind,
    reason?: string,
): Promise<boolean> {
    if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId)) return false
    try {
        await getPrismaClient().activationEvent.create({
            data: {
                guildDiscordId: guildId,
                kind,
                reason: reason ? reason.slice(0, MAX_REASON_LENGTH) : null,
            },
        })
        return true
    } catch (error) {
        try {
            warnLog({
                message: 'activation event insert failed',
                error,
                data: { guildId, kind },
            })
        } catch (logError) {
            try {
                console.error('activation event log failed', logError)
            } catch {
                // logging must never break the caller
            }
        }
        return false
    }
}
