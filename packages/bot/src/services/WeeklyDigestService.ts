import type {
    Client,
    TextChannel,
    ForumChannel,
    Guild,
    GuildScheduledEvent,
    Message,
} from 'discord.js'
import { ChannelType, EmbedBuilder } from 'discord.js'
import Parser from 'rss-parser'
import { COLOR } from '@lucky/shared/constants'
import {
    getPrismaClient,
    debugLog,
    errorLog,
    infoLog,
    parseIntEnv,
} from '@lucky/shared/utils'

const DEFAULT_TICK_INTERVAL_MS = 60 * 60 * 1000
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
            parseIntEnv(
                'WEEKLY_DIGEST_TICK_INTERVAL_MS',
                DEFAULT_TICK_INTERVAL_MS,
                { min: 1 },
            )
        this.clock = options.clock ?? (() => Date.now())
    }

    start(client: Client): void {
        if (this.timer) return

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
        if (this.tickInProgress || !this.client) {
            debugLog({
                message: 'Weekly digest tick early return',
                data: {
                    tickInProgress: this.tickInProgress,
                    client: !!this.client,
                },
            })
            return
        }
        this.tickInProgress = true

        try {
            const now = this.clock()
            const utcDate = new Date(now)

            const dayOfWeek = utcDate.getUTCDay()
            const hour = utcDate.getUTCHours()

            if (dayOfWeek !== 0 || hour !== 12) {
                debugLog({
                    message: 'Weekly digest: not Sunday 12:00 UTC',
                    data: { dayOfWeek, hour },
                })
                return
            }

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

            const forumChannel = (await guild.channels
                .fetch(forumChannelId)
                .catch(() => null)) as TextChannel | ForumChannel | null
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

            const currentMemberCount = guild.memberCount ?? 0

            const prisma = getPrismaClient()
            const previousSnapshot =
                await prisma.weeklyDigestSnapshot.findFirst({
                    where: { guildId },
                    orderBy: { postedAt: 'desc' },
                    take: 1,
                })

            if (previousSnapshot) {
                const lastPosted = new Date(previousSnapshot.postedAt)
                const now = new Date(this.clock())
                const startOfThisWeek = new Date(now)
                startOfThisWeek.setUTCDate(now.getUTCDate() - now.getUTCDay())
                startOfThisWeek.setUTCHours(0, 0, 0, 0)

                if (lastPosted >= startOfThisWeek) {
                    debugLog({
                        message: 'Weekly digest already sent this week',
                    })
                    return false
                }
            }

            const previousMemberCount = previousSnapshot?.memberCount ?? 0
            const memberDelta = previousSnapshot
                ? currentMemberCount - previousMemberCount
                : 0

            const topMessages = await this.getTopReactedMessages(forumChannel)

            const upcomingEvents = await this.getUpcomingEvents(guild)

            const newGuides = await this.getNewGuidesThisWeek()

            const embed = this.buildDigestEmbed(
                currentMemberCount,
                memberDelta,
                topMessages,
                upcomingEvents,
                newGuides,
            )

            await digestChannel.send({ embeds: [embed] })

            await prisma.weeklyDigestSnapshot.create({
                data: {
                    guildId,
                    memberCount: currentMemberCount,
                    postedAt: new Date(this.clock()),
                },
            })

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
        forumChannel: TextChannel | ForumChannel,
    ): Promise<ReactionCount[]> {
        try {
            const messages: Message[] = []
            if (forumChannel.type === ChannelType.GuildForum) {
                const active = await forumChannel.threads.fetchActive()
                for (const thread of active.threads.values()) {
                    const starter = await thread
                        .fetchStarterMessage()
                        .catch(() => null)
                    if (starter) messages.push(starter)
                }
            } else {
                const fetched = await forumChannel.messages.fetch({
                    limit: 100,
                })
                messages.push(...fetched.values())
            }
            const oneWeekAgo = this.clock() - MS_PER_WEEK

            const reactionCounts: ReactionCount[] = []

            for (const message of messages) {
                if (message.createdTimestamp < oneWeekAgo) continue

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

    private async getNewGuidesThisWeek(): Promise<
        Array<{ title: string; link: string }>
    > {
        try {
            const feedUrl =
                process.env.CRIATIVARIA_GUIDES_FEED_URL ||
                'https://criativaria.com.br/rss.xml'

            const parser = new Parser()

            const feed = await parser.parseURL(feedUrl)

            if (!feed.items || feed.items.length === 0) {
                return []
            }

            const now = this.clock()
            const oneWeekAgo = now - MS_PER_WEEK
            const guides: Array<{ title: string; link: string }> = []

            for (const item of feed.items) {
                if (!item.title || !item.link) continue

                if (item.pubDate) {
                    const parsed = Date.parse(item.pubDate as string)
                    if (Number.isNaN(parsed)) {
                        continue
                    }
                    const itemTime = parsed
                    if (itemTime < oneWeekAgo) {
                        continue
                    }
                    if (itemTime > now) {
                        continue
                    }
                } else {
                    continue
                }

                guides.push({
                    title: item.title,

                    link: item.link,
                })

                if (guides.length >= 3) break
            }

            return guides
        } catch (error: unknown) {
            errorLog({
                message: 'Failed to fetch RSS feed for guides',
                error: error as Error,
            })
            return []
        }
    }

    private buildDigestEmbed(
        memberCount: number,
        memberDelta: number,
        topMessages: ReactionCount[],
        upcomingEvents: string[],
        newGuides: Array<{ title: string; link: string }>,
    ): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setColor(COLOR.LUCKY_PURPLE)
            .setTitle(process.env.DIGEST_TITLE ?? '📅 Resumo da semana')
            .setFooter({ text: process.env.DIGEST_FOOTER ?? 'lucky.bot' })
            .setTimestamp()

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

        if (newGuides.length > 0) {
            const MAX_FIELD_VALUE = 1024
            const MAX_TITLE_LENGTH = 80
            const truncatedGuides = newGuides.map((guide) => {
                const title =
                    guide.title.length > MAX_TITLE_LENGTH
                        ? `${guide.title.substring(0, MAX_TITLE_LENGTH)}…`
                        : guide.title
                return `[📚 ${title}](${guide.link})`
            })

            let guidesList = ''
            for (const guide of truncatedGuides) {
                const line = `${guidesList ? '\n' : ''}${guide}`
                if ((guidesList + line).length > MAX_FIELD_VALUE) {
                    continue
                }
                guidesList = guidesList + line
            }

            if (guidesList) {
                embed.addFields({
                    name: '📚 Novos guias da semana',
                    value: guidesList,
                    inline: false,
                })
            }
        }

        return embed
    }
}

export const weeklyDigestService = new WeeklyDigestService()
