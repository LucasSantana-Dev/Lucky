import type { Client, GuildScheduledEvent } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import { errorLog, debugLog } from '@lucky/shared/utils'
import { getPrismaClient } from '@lucky/shared/utils/database/prismaClient'

const EMBED_COLOR = 0xe879a0

export class ScheduledEventNotificationService {
    async notifyScheduledEvent(
        event: GuildScheduledEvent,
        client: Client,
    ): Promise<void> {
        try {
            const db = getPrismaClient()
            const config = await db.scheduledEventNotification.findUnique({
                where: { guildId: event.guildId },
            })

            if (!config || !config.enabled) {
                debugLog({
                    message:
                        'Scheduled event notification: no config or disabled',
                    data: { guildId: event.guildId },
                })
                return
            }

            const channel = await client.channels.fetch(config.channelId)
            if (!channel || !channel.isTextBased() || !('send' in channel)) {
                errorLog({
                    message:
                        'Scheduled event notification: channel not found or not text-based',
                    data: {
                        channelId: config.channelId,
                        guildId: event.guildId,
                    },
                })
                return
            }

            const description = event.description
                ? event.description.slice(0, 200)
                : 'No description'

            const startTimeStr = event.scheduledStartAt
                ? `<t:${Math.floor(event.scheduledStartAt.getTime() / 1000)}:F> (<t:${Math.floor(event.scheduledStartAt.getTime() / 1000)}:R>)`
                : 'Time not set'

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(`📅 ${event.name}`)
                .setURL(
                    `https://discord.com/events/${event.guildId}/${event.id}`,
                )
                .setDescription(description)
                .addFields({
                    name: 'Starts',
                    value: startTimeStr,
                    inline: false,
                })
                .setTimestamp()

            const content = config.mentionRoleId
                ? `<@&${config.mentionRoleId}>`
                : undefined

            const sendableChannel = channel as unknown as {
                send: (options: unknown) => Promise<unknown>
            }
            await sendableChannel.send({
                content,
                embeds: [embed],
                allowedMentions: config.mentionRoleId
                    ? { roles: [config.mentionRoleId] }
                    : undefined,
            })

            debugLog({
                message: 'Scheduled event notification sent',
                data: { eventId: event.id, guildId: event.guildId },
            })
        } catch (err) {
            errorLog({
                message: 'Failed to send scheduled event notification',
                error: err,
                data: { eventId: event.id, guildId: event.guildId },
            })
        }
    }
}

export const scheduledEventNotificationService =
    new ScheduledEventNotificationService()
