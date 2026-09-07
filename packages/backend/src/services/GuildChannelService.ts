import { z } from 'zod'
import type { Client } from 'discord.js'
import { debugLog, errorLog } from '@lucky/shared/utils'
import type { GuildChannelOption, GuildEmojiOption } from '@lucky/shared/types'
import {
    getClient as getDiscordClient,
    getServableGuild,
    getBotToken,
} from '../utils/discordClientAccessor'
import { isSnowflakeId } from '../schemas/common'

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10'

class GuildChannelService {
    private getBotClient(): Client | null {
        return getDiscordClient()
    }

    private validateChannelArray(data: unknown): Array<{
        id?: string
        name?: string
        type: number
        position?: number
    }> {
        if (!Array.isArray(data)) {
            errorLog({
                message: 'Invalid channels response from Discord API',
                data: { expectedArray: true, receivedType: typeof data },
            })
            return []
        }

        const channelSchema = z.object({
            id: z.string().optional(),
            name: z.string().optional(),
            type: z.number().int(),
            position: z.number().optional(),
        })

        const validated: Array<{
            id?: string
            name?: string
            type: number
            position?: number
        }> = []
        for (const item of data) {
            const result = channelSchema.safeParse(item)
            if (result.success) {
                validated.push(result.data)
            } else {
                debugLog({
                    message: 'Skipping invalid channel in Discord API response',
                    data: { errors: result.error.issues },
                })
            }
        }
        return validated
    }

    async getGuildTextChannelOptions(
        guildId: string,
    ): Promise<GuildChannelOption[]> {
        if (!isSnowflakeId(guildId)) {
            return []
        }

        const client = this.getBotClient()

        if (client) {
            try {
                const guild =
                    client.guilds.cache.get(guildId) ??
                    (await client.guilds.fetch(guildId))
                const channels = await guild.channels.fetch()
                return [...channels.values()]
                    .filter(
                        (channel): channel is NonNullable<typeof channel> =>
                            channel !== null &&
                            (channel.type === 0 ||
                                channel.type === 5 ||
                                channel.type === 15 ||
                                channel.type === 16),
                    )
                    .sort((a, b) => a.rawPosition - b.rawPosition)
                    .map((channel) => ({
                        id: channel.id,
                        name: `#${channel.name}`,
                    }))
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch guild channels from bot client',
                    error,
                })
            }
        }

        const token = getBotToken()
        if (!token) {
            return []
        }

        // Reject anything that is not a Discord snowflake before it reaches the
        // request URL — validated inline at the sink so the ID cannot forge the
        // request (SSRF / path-traversal guard).
        if (!/^\d{17,20}$/.test(guildId)) {
            throw new Error('Invalid Discord guild id')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/channels`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                return []
            }

            const payload = this.validateChannelArray(await response.json())

            const filteredChannels = payload.filter(
                (
                    channel,
                ): channel is {
                    id: string
                    name: string
                    type: number
                    position?: number
                } =>
                    typeof channel.id === 'string' &&
                    typeof channel.name === 'string' &&
                    (channel.type === 0 ||
                        channel.type === 5 ||
                        channel.type === 15 ||
                        channel.type === 16),
            )

            return filteredChannels
                .sort(
                    (
                        a: {
                            id: string
                            name: string
                            type: number
                            position?: number
                        },
                        b: {
                            id: string
                            name: string
                            type: number
                            position?: number
                        },
                    ) => (a.position ?? 0) - (b.position ?? 0),
                )
                .map(
                    (channel: {
                        id: string
                        name: string
                        type: number
                        position?: number
                    }) => ({
                        id: channel.id,
                        name: `#${channel.name}`,
                    }),
                )
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild channels',
                error,
            })
            return []
        }
    }

    async getGuildEmojis(guildId: string): Promise<GuildEmojiOption[]> {
        // Validate snowflake before attempting to fetch from client or Discord API
        if (!isSnowflakeId(guildId)) {
            return []
        }

        const client = this.getBotClient()

        if (client) {
            try {
                const guild = await getServableGuild(guildId)
                if (guild) {
                    return [...guild.emojis.cache.values()].map((emoji) => ({
                        id: emoji.id,
                        name: emoji.name ?? '',
                        animated: emoji.animated ?? false,
                    }))
                }
            } catch (error) {
                debugLog({
                    message: 'Failed to fetch guild emojis from bot client',
                    error,
                })
            }
        }

        const token = getBotToken()
        if (!token) {
            return []
        }

        // Reject anything that is not a Discord snowflake before it reaches the
        // request URL — validated inline at the sink so the ID cannot forge the
        // request (SSRF / path-traversal guard).
        if (!/^\d{17,20}$/.test(guildId)) {
            throw new Error('Invalid Discord guild id')
        }

        try {
            const response = await fetch(
                `${DISCORD_API_BASE_URL}/guilds/${guildId}/emojis`,
                {
                    headers: {
                        Authorization: `Bot ${token}`,
                    },
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!response.ok) {
                throw new Error(`Discord API error: ${response.status}`)
            }

            const payload = (await response.json()) as unknown[]

            return payload
                .filter(
                    (
                        emoji,
                    ): emoji is {
                        id: string
                        name?: string
                        animated?: boolean
                    } =>
                        typeof emoji === 'object' &&
                        emoji !== null &&
                        typeof (emoji as { id?: unknown }).id === 'string',
                )
                .map((emoji) => ({
                    id: emoji.id,
                    name: emoji.name ?? '',
                    animated: emoji.animated ?? false,
                }))
        } catch (error) {
            errorLog({
                message: 'Failed to fetch guild emojis',
                error,
            })
            throw error
        }
    }
}

export const guildChannelService = new GuildChannelService()
