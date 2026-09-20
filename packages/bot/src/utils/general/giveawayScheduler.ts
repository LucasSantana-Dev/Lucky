import type { TextChannel } from 'discord.js'
import { ChannelType, EmbedBuilder } from 'discord.js'
import { giveawayService } from '@lucky/shared/services'
import { errorLog, debugLog, infoLog } from '@lucky/shared/utils'

import { IntervalScheduler } from './IntervalScheduler'

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000 // Every 60 seconds

export class GiveawayScheduler extends IntervalScheduler {
    private readonly clock: () => Date

    constructor(options?: { tickIntervalMs?: number; clock?: () => Date }) {
        const tickIntervalMs =
            options?.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS
        super(tickIntervalMs)
        this.clock = options?.clock ?? (() => new Date())
    }

    protected onStart(): void {
        infoLog({
            message: 'GiveawayScheduler started',
            data: { tickIntervalMs: this.tickIntervalMs },
        })
    }

    protected async execute(): Promise<void> {
        const giveaways = await giveawayService.getEndedDue()

        for (const giveaway of giveaways) {
            await this.processEndedGiveaway(giveaway)
        }
    }

    private async processEndedGiveaway(giveaway: {
        id: string
        channelId: string
        prize: string
        winnersCount: number
        messageId: string | null
        winnerIds?: string[]
    }): Promise<void> {
        try {
            // FIRST: Draw and persist winners up front so giveaway is finalized
            // regardless of whether announcement succeeds. This ensures:
            // 1. giveaway.endedAt is set immediately → won't re-process forever
            // 2. We have the actual winners to announce, not an empty list
            const winners =
                giveaway.winnerIds ??
                (await giveawayService.endAndDraw(
                    giveaway.id,
                    giveaway.winnersCount,
                ))

            // THEN: Best-effort announce
            if (!this.client || !giveaway.messageId) {
                debugLog({
                    message: 'Giveaway finalized without announcement',
                    data: { giveawayId: giveaway.id, winners },
                })
                return
            }

            // Fetch the channel (may not be in cache). Normalize to
            // `Channel | null` so the fetch result (also `| null`) assigns
            // cleanly and the guard below narrows it.
            let channel =
                this.client.channels.cache.get(giveaway.channelId) ?? null
            if (!channel) {
                try {
                    channel = await this.client.channels.fetch(
                        giveaway.channelId,
                    )
                } catch (err) {
                    // Channel deleted or inaccessible; log and return
                    // (giveaway is already finalized above)
                    errorLog({
                        message:
                            'Channel not found when processing giveaway; finalized without announcement:',
                        error: err,
                        data: {
                            giveawayId: giveaway.id,
                            channelId: giveaway.channelId,
                        },
                    })
                    return
                }
            }

            if (!channel || channel.type !== ChannelType.GuildText) {
                debugLog({
                    message: 'Giveaway channel is not text-based',
                    data: {
                        giveawayId: giveaway.id,
                        channelId: giveaway.channelId,
                    },
                })
                return
            }

            const textChannel = channel as TextChannel
            const msg = await textChannel.messages
                .fetch(giveaway.messageId)
                .catch(() => null)

            if (msg) {
                const embed = EmbedBuilder.from(msg.embeds[0] ?? {})
                    .setColor(0xff0000)
                    .setDescription(`**Prize:** ${giveaway.prize} (Ended)`)
                    .setFields([
                        {
                            name: 'Winners',
                            value:
                                winners && winners.length > 0
                                    ? winners.map((id) => `<@${id}>`).join(', ')
                                    : 'no valid entries',
                            inline: false,
                        },
                    ])

                await msg.edit({ embeds: [embed.toJSON()] })

                if (winners.length > 0) {
                    await textChannel.send({
                        content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')} on winning ${giveaway.prize}!`,
                        allowedMentions: { users: winners },
                    })
                } else {
                    await textChannel.send({
                        content: '❌ No valid entries for this giveaway.',
                    })
                }
            }

            infoLog({
                message: 'Giveaway processed',
                data: { giveawayId: giveaway.id, winners },
            })
        } catch (err) {
            errorLog({
                message: 'Error processing ended giveaway:',
                error: err,
                data: { giveawayId: giveaway.id },
            })
        }
    }
}

export const giveawayScheduler = new GiveawayScheduler()
