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

            // Only send on Sundays between 12:00 and 12:59 UTC
            const dayOfWeek = utcDate.getUTCDay()
            const hour = utcDate.getUTCHours()

            if (dayOfWeek !== 0 || hour !== 12) {
                debugLog({
                    message: 'Weekly digest: not Sunday 12:00 UTC',
                    data: { dayOfWeek, hour },
                })
                return
            }

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

            // Idempotency check: don't send if we already sent this week
            if (previousSnapshot) {
                const lastPosted = new Date(previousSnapshot.postedAt)
                const now = new Date(this.clock())
                const startOfThisWeek = new Date(now)
                // Sunday-anchored: day - getUTCDay() (0 for Sunday = no offset, 1 for Monday = -1, etc.)
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

            // Fetch top-reacted messages from last 7 days
            const topMessages = await this.getTopReactedMessages(forumChannel)

            // Fetch upcoming events in next 7 days
            const upcomingEvents = await this.getUpcomingEvents(guild)

            // Fetch new guides from RSS feed this week
            const newGuides = await this.getNewGuidesThisWeek()

            // Build embed
            const embed = this.buildDigestEmbed(
                currentMemberCount,
                memberDelta,
                topMessages,
                upcomingEvents,
                newGuides,
            )

            // Send embed first — persisting the snapshot only after a
            // successful send keeps a failed send from advancing the weekly
            // baseline (which would suppress retry and lose the digest)
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
            // Forum posts live in threads — the forum container itself has no
            // .messages, so collect each active thread's starter message.
            // Text channels keep the plain last-100-messages fetch.
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
                // Filter by last 7 days
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

                // Filter by this week (pubDate must be valid, within last 7 days, not future)

                if (item.pubDate) {
                    const parsed = Date.parse(item.pubDate as string)
                    if (Number.isNaN(parsed)) {
                        // Unparsable date — skip
                        continue
                    }
                    const itemTime = parsed
                    // Skip if older than one week ago
                    if (itemTime < oneWeekAgo) {
                        // Feeds may not be sorted; use continue to check remaining items
                        continue
                    }
                    // Skip if in the future
                    if (itemTime > now) {
                        continue
                    }
                } else {
                    // No pubDate — skip undated items
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
            // Fail soft: return empty array, digest will send without this section
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

        // New guides field — only if there are items
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

            // Assemble guide list and enforce field value cap
            let guidesList = ''
            for (const guide of truncatedGuides) {
                const line = `${guidesList ? '\n' : ''}${guide}`
                if ((guidesList + line).length > MAX_FIELD_VALUE) {
                    // Skip only this over-long entry; later (shorter) guides still fit
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
