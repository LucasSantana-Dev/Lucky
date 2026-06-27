import type {
    Client,
    TextChannel,
    Guild,
    GuildScheduledEvent,
} from 'discord.js'
import { ChannelType, EmbedBuilder } from 'discord.js'
import { COLOR } from '@lucky/shared/constants'
import {
    getPrismaClient,
    debugLog,
    errorLog,
    infoLog,
} from '@lucky/shared/utils'

const DEFAULT_TICK_INTERVAL_MS = 60 * 60 * 1000 // Check every hour
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

type WeeklyDigestServiceOptions = {
    tickIntervalMs?: number
    clock?: () => number
}

type ReactionCount = {
    messageId: string
    messageUrl: string
    authorId: string
    content: string
    totalReactions: number
}

function parsePositiveIntEnv(
    raw: string | undefined,
    fallback: number,
    name: string,
): number {
    if (raw === undefined) return fallback
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        errorLog({
            message: `Invalid ${name} env value, falling back to default`,
            data: { raw, fallback },
        })
        return fallback
    }
    return parsed
}

/**
 * Calculate milliseconds until next Monday 12:00 UTC.
 * Useful for initial delay before starting interval-based scheduling.
 */
function msUntilNextMonday12UTC(): number {
    const now = new Date()
    const utcDate = new Date(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
    )

    // Find next Monday at 12:00 UTC
    const daysUntilMonday = (1 - utcDate.getUTCDay() + 7) % 7 || 7
    const targetDate = new Date(
        utcDate.getTime() + daysUntilMonday * MS_PER_DAY,
    )
    targetDate.setUTCHours(12, 0, 0, 0)

    const msUntil = targetDate.getTime() - utcDate.getTime()
    return Math.max(1000, msUntil) // At least 1 second
}

export class WeeklyDigestService {
    private readonly tickIntervalMs: number
    private readonly clock: () => number
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null
    private tickInProgress = false
    private lastDigestTime = 0

    constructor(options: WeeklyDigestServiceOptions = {}) {
        this.tickIntervalMs =
            options.tickIntervalMs ??
            parsePositiveIntEnv(
                process.env.WEEKLY_DIGEST_TICK_INTERVAL_MS,
                DEFAULT_TICK_INTERVAL_MS,
                'WEEKLY_DIGEST_TICK_INTERVAL_MS',
            )
        this.clock = options.clock ?? (() => Date.now())
    }

    start(client: Client): void {
        if (this.timer) return

        // Check if the service is configured via env vars
        const digestChannelId = process.env.DIGEST_CHANNEL_ID
        const forumChannelId = process.env.FORUM_CHANNEL_ID

        if (!digestChannelId || !forumChannelId) {
            debugLog({
                message:
                    'Weekly digest service disabled: DIGEST_CHANNEL_ID or FORUM_CHANNEL_ID not configured',
            })
            return
        }

        this.client = client
        infoLog({
            message: `Weekly digest service started (interval: ${this.tickIntervalMs}ms)`,
        })

        // Run once immediately to check if a digest is due, then set interval
        void this.tick()
        this.timer = setInterval(() => {
            void this.tick()
        }, this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        this.client = null
    }

    async tick(): Promise<void> {
        if (this.tickInProgress || !this.client) return
        this.tickInProgress = true

        try {
            const now = this.clock()
            const utcDate = new Date(now)

            // Only send on Mondays between 12:00 and 12:59 UTC
            const dayOfWeek = utcDate.getUTCDay()
            const hour = utcDate.getUTCHours()

            if (dayOfWeek !== 1 || hour !== 12) return // Not Monday 12:xx UTC

            // Single-send per hour: don't send again if we sent in the last 30 mins
            if (now - this.lastDigestTime < 30 * 60 * 1000) return

            this.lastDigestTime = now

            const digestChannelId = process.env.DIGEST_CHANNEL_ID
            const forumChannelId = process.env.FORUM_CHANNEL_ID

            if (!digestChannelId || !forumChannelId) return

            try {
                const delivered = await this.sendDigestForGuild(
                    digestChannelId,
                    forumChannelId,
                )
                if (delivered) {
                    debugLog({
                        message: 'Weekly digest sent successfully',
                    })
                }
            } catch (error) {
                errorLog({
                    message: 'Weekly digest tick failed',
                    error,
                })
            }
        } catch (error) {
            errorLog({
                message: 'Weekly digest scheduler tick failed',
                error: error as Error,
            })
        } finally {
            this.tickInProgress = false
        }
    }

    private async sendDigestForGuild(
        digestChannelId: string,
        forumChannelId: string,
    ): Promise<boolean> {
        if (!this.client) return false

        try {
            // Resolve digest channel
            const digestChannel = (await this.client.channels
                .fetch(digestChannelId)
                .catch(() => null)) as TextChannel | null
            if (
                !digestChannel ||
                digestChannel.type !== ChannelType.GuildText
            ) {
                errorLog({
                    message: 'Weekly digest channel unavailable',
                    data: { digestChannelId },
                })
                return false
            }

            const guildId = digestChannel.guildId
            const guild = digestChannel.guild

            // Resolve forum channel
            const forumChannel = (await guild.channels
                .fetch(forumChannelId)
                .catch(() => null)) as TextChannel | null
            if (
                !forumChannel ||
                (forumChannel.type !== ChannelType.GuildText &&
                    forumChannel.type !== ChannelType.GuildForum)
            ) {
                errorLog({
                    message: 'Forum channel unavailable',
                    data: { guildId, forumChannelId },
                })
                return false
            }

            // Get member count
            const currentMemberCount = guild.memberCount ?? 0

            // Get previous snapshot for delta
            const prisma = getPrismaClient()
            const previousSnapshot =
                await prisma.weeklyDigestSnapshot.findFirst({
                    where: { guildId },
                    orderBy: { postedAt: 'desc' },
                    take: 1,
                })

            const previousMemberCount = previousSnapshot?.memberCount ?? 0
            const memberDelta = currentMemberCount - previousMemberCount

            // Fetch top-reacted messages from last 7 days
            const topMessages = await this.getTopReactedMessages(forumChannel)

            // Fetch upcoming events in next 7 days
            const upcomingEvents = await this.getUpcomingEvents(guild)

            // Build embed
            const embed = this.buildDigestEmbed(
                currentMemberCount,
                memberDelta,
                topMessages,
                upcomingEvents,
            )

            // Save snapshot
            await prisma.weeklyDigestSnapshot.create({
                data: {
                    guildId,
                    memberCount: currentMemberCount,
                    postedAt: new Date(this.clock()),
                },
            })

            // Send embed
            await digestChannel.send({ embeds: [embed] })

            debugLog({
                message: 'Weekly digest sent successfully',
                data: { guildId },
            })
            return true
        } catch (error) {
            errorLog({
                message: 'Failed to send weekly digest',
                error,
                data: { digestChannelId },
            })
            return false
        }
    }

    private async getTopReactedMessages(
        forumChannel: TextChannel,
    ): Promise<ReactionCount[]> {
        try {
            // Fetch last 100 messages from forum
            const messages = await forumChannel.messages.fetch({ limit: 100 })

            const reactionCounts: ReactionCount[] = []

            for (const message of messages.values()) {
                let totalReactions = 0
                for (const reaction of message.reactions.cache.values()) {
                    totalReactions += reaction.count
                }

                if (totalReactions > 0) {
                    reactionCounts.push({
                        messageId: message.id,
                        messageUrl: message.url,
                        authorId: message.author.id,
                        content: message.content || '(empty message)',
                        totalReactions,
                    })
                }
            }

            // Sort by reaction count descending and take top 3
            return reactionCounts
                .sort((a, b) => b.totalReactions - a.totalReactions)
                .slice(0, 3)
        } catch (error) {
            errorLog({
                message: 'Failed to fetch top reacted messages',
                error,
            })
            return []
        }
    }

    private async getUpcomingEvents(guild: Guild): Promise<string[]> {
        try {
            const events = await guild.scheduledEvents.fetch()
            const now = this.clock()
            const oneWeekFromNow = now + MS_PER_WEEK

            const upcomingEvents = [...events.values()]
                .filter((event: GuildScheduledEvent) => {
                    const eventTime = event.scheduledStartTimestamp ?? 0
                    return eventTime > now && eventTime < oneWeekFromNow
                })
                .sort(
                    (a: GuildScheduledEvent, b: GuildScheduledEvent) =>
                        (a.scheduledStartTimestamp ?? 0) -
                        (b.scheduledStartTimestamp ?? 0),
                )
                .slice(0, 5)
                .map(
                    (event: GuildScheduledEvent) =>
                        `• ${event.name} <t:${Math.floor((event.scheduledStartTimestamp ?? 0) / 1000)}:R>`,
                )

            return upcomingEvents
        } catch (error) {
            errorLog({
                message: 'Failed to fetch upcoming events',
                error,
            })
            return []
        }
    }

    private buildDigestEmbed(
        memberCount: number,
        memberDelta: number,
        topMessages: ReactionCount[],
        upcomingEvents: string[],
    ): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLOR.LUCKY_PURPLE)
            .setTitle('📅 Criativaria — Resumo da semana')
            .setFooter({ text: 'criativaria.com.br' })
            .setTimestamp()

        // Member count field
        const memberText =
            memberDelta > 0
                ? `${memberCount} membros (+${memberDelta} esta semana)`
                : memberDelta < 0
                  ? `${memberCount} membros (${memberDelta} esta semana)`
                  : `${memberCount} membros`
        embed.addFields({
            name: '👥 Comunidade',
            value: memberText,
            inline: false,
        })

        // Top reacted messages field
        if (topMessages.length > 0) {
            const topMessagesList = topMessages
                .map(
                    (msg) =>
                        `[💬 ${msg.content.substring(0, 50)}](${msg.messageUrl})`,
                )
                .join('\n')
            embed.addFields({
                name: '💬 Top da semana',
                value: topMessagesList,
                inline: false,
            })
        } else {
            embed.addFields({
                name: '💬 Top da semana',
                value: 'Nenhuma mensagem destacada',
                inline: false,
            })
        }

        // Upcoming events field
        if (upcomingEvents.length > 0) {
            embed.addFields({
                name: '🗓️ Esta semana',
                value: upcomingEvents.join('\n'),
                inline: false,
            })
        } else {
            embed.addFields({
                name: '🗓️ Esta semana',
                value: 'Nada agendado',
                inline: false,
            })
        }

        return embed
    }
}

export const weeklyDigestService = new WeeklyDigestService()
