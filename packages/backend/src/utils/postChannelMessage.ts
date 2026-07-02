import { AppError } from '../errors/AppError'
import { errorLog } from '@lucky/shared/utils'

const DISCORD_API = 'https://discord.com/api/v10'

// Discord snowflakes are 17-20 digit numeric IDs; anything else would let
// request input alter the API path (SSRF/path injection).
const SNOWFLAKE_RE = /^\d{17,20}$/

export type ChannelMessagePayload = {
    channelId: string
    content?: string
    embeds?: unknown[]
}

/**
 * Posts a message to a Discord channel via the Discord API.
 * Validates required fields, reads bot token, and handles Discord errors.
 *
 * @throws AppError with status 400 if channelId or (content|embeds) missing
 * @throws AppError with status 500 if DISCORD_TOKEN missing
 * @throws AppError with status 502 if Discord API returns non-ok response
 */
export async function postChannelMessage(payload: ChannelMessagePayload, logContext: string): Promise<void> {
    // Validate required fields
    if (!payload.channelId || (!payload.content && !payload.embeds)) {
        throw AppError.badRequest('channelId + content|embeds required')
    }
    if (!SNOWFLAKE_RE.test(payload.channelId)) {
        throw AppError.badRequest('channelId must be a Discord snowflake')
    }

    // Get bot token
    const token = process.env.DISCORD_TOKEN
    if (!token) {
        throw new AppError(500, 'bot token missing')
    }

    // Post to Discord
    const resp = await fetch(`${DISCORD_API}/channels/${payload.channelId}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content: payload.content?.slice(0, 1900),
            embeds: payload.embeds,
        }),
        signal: AbortSignal.timeout(10_000),
    })

    // Handle response
    if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        errorLog({
            message: logContext,
            data: { status: resp.status, text },
        })
        throw new AppError(502, `discord ${resp.status}`)
    }
}
