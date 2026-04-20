import type { Client, TextChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { EmbedBuilder } from '@discordjs/builders'
import { COLOR } from '@lucky/shared/constants'
import { getPrismaClient, debugLog, errorLog, infoLog } from '@lucky/shared/utils'

// Tick every hour by default. The scheduler tracks the last UTC date it
// announced for each guild (in-memory) so multiple ticks on the same day
// are no-ops.
const DEFAULT_TICK_INTERVAL_MS = 60 * 60 * 1000

type BirthdaySchedulerOptions = {
    tickIntervalMs?: number
    clock?: () => Date
}

type BirthdayRow = {
    userId: string
    guildId: string
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

export class BirthdayScheduler {
    private readonly tickIntervalMs: number
    private readonly clock: () => Date
    private timer: ReturnType<typeof setInterval> | null = null
    private client: Client | null = null
    private tickInProgress = false
    // Tracks the last YYYY-MM-DD we announced per guild, so reruns within
    // the same day are no-ops even without Redis coordination.
    private readonly lastAnnouncedPerGuild = new Map<string, string>()

    constructor(options: BirthdaySchedulerOptions = {}) {
        this.tickIntervalMs =
            options.tickIntervalMs ??
            parsePositiveIntEnv(
                process.env.BIRTHDAY_TICK_INTERVAL_MS,
                DEFAULT_TICK_INTERVAL_MS,
                'BIRTHDAY_TICK_INTERVAL_MS',
            )
        this.clock = options.clock ?? (() => new Date())
    }

    start(client: Client): void {
        if (this.timer) return
        this.client = client
        infoLog({
            message: `Birthday scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        // Run once immediately on startup so a restart near midnight UTC
        // doesn't miss the window.
        void this.tick()
        this.timer = setInterval(() => void this.tick(), this.tickIntervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    async tick(): Promise<void> {
        if (this.tickInProgress || !this.client) return
        this.tickInProgress = true
        try {
            const now = this.clock()
            const month = now.getUTCMonth() + 1
            const day = now.getUTCDate()
            const todayKey = now.toISOString().slice(0, 10)

            const prisma = getPrismaClient()
            const rows = (await prisma.memberBirthday.findMany({
                where: { month, day },
                select: { userId: true, guildId: true },
            })) as BirthdayRow[]

            if (rows.length === 0) {
                debugLog({ message: `birthday tick: no matches for ${todayKey}` })
                return
            }

            const byGuild = new Map<string, string[]>()
            for (const row of rows) {
                const list = byGuild.get(row.guildId) ?? []
                list.push(row.userId)
                byGuild.set(row.guildId, list)
            }

            for (const [guildId, userIds] of byGuild) {
                if (this.lastAnnouncedPerGuild.get(guildId) === todayKey) {
                    continue
                }
                await this.announceForGuild(guildId, userIds, todayKey)
            }
        } catch (error) {
            errorLog({
                message: 'birthday scheduler tick failed',
                error: error as Error,
            })
        } finally {
            this.tickInProgress = false
        }
    }

    private async announceForGuild(
        guildId: string,
        userIds: string[],
        todayKey: string,
    ): Promise<void> {
        if (!this.client) return
        try {
            const prisma = getPrismaClient()
            const settings = await prisma.guildSettings.findUnique({
                where: { guildId },
                select: { birthdayChannelId: true },
            })
            const channelId = settings?.birthdayChannelId
            if (!channelId) {
                debugLog({
                    message: 'birthday scheduler: no channel configured',
                    data: { guildId, userIds: userIds.length },
                })
                return
            }
            const channel = await this.client.channels
                .fetch(channelId)
                .catch(() => null)
            if (!channel || channel.type !== ChannelType.GuildText) {
                errorLog({
                    message: 'birthday channel missing or wrong type',
                    data: { guildId, channelId },
                })
                return
            }
            const mentions = userIds.map((id) => `<@${id}>`).join(', ')
            const embed = new EmbedBuilder()
                .setTitle('🎂 Happy Birthday!')
                .setDescription(
                    `Wishing a wonderful day to ${mentions}!\n\nSet yours with \`/birthday set\`.`,
                )
                .setColor(COLOR.LUCKY_PURPLE)
            await (channel as TextChannel).send({
                content: mentions,
                embeds: [embed.toJSON()],
                allowedMentions: { users: userIds },
            })
            this.lastAnnouncedPerGuild.set(guildId, todayKey)
            infoLog({
                message: `birthday announced in guild ${guildId}`,
                data: { count: userIds.length, date: todayKey },
            })
        } catch (error) {
            errorLog({
                message: 'birthday announce failed',
                data: { guildId },
                error: error as Error,
            })
        }
    }
}

export const birthdayScheduler = new BirthdayScheduler()
