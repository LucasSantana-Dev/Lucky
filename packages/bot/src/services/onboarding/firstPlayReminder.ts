import { EmbedBuilder, ChannelType, type Guild } from 'discord.js'
import { recordActivationEvent } from '@lucky/shared/services'
import { errorLog, getPrismaClient, infoLog } from '@lucky/shared/utils'
import { IntervalScheduler } from '../../utils/general/IntervalScheduler'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { createOnboardingStationRow } from '../../handlers/onboardingStation'
import { findOnboardingChannel } from '../../handlers/onboardingChannel'

const HOUR_MS = 60 * 60 * 1000
/** A guild is reminded once its welcome message is at least this old. */
export const REMINDER_AFTER_MS = 24 * HOUR_MS
/**
 * ...and at most this old. The upper bound keeps the first deploy from
 * reminding every guild that ever joined, and drops a guild the bot could
 * not reach for two days instead of reminding it late.
 */
export const REMINDER_UNTIL_MS = 72 * HOUR_MS

type ReminderOutcome =
    | 'sent'
    | 'played'
    | 'already_reminded'
    | 'not_in_cache'
    | 'no_channel'
    | 'failed'

/**
 * One reminder for a guild that added Lucky and played nothing in its first
 * day. Most guilds that never play a first song never come back, and the
 * welcome message is the only thing they saw. It goes to the same channel as
 * the welcome message, carries the same one-click button, and is never
 * repeated: the `first_play_reminder` activation event is the record, written
 * before the send so a crash cannot produce a second one.
 *
 * In-channel and utility-first, per decisions/2026-06-18-in-bot-growth.md
 * (no DMs, no repeated nudges).
 */
export class FirstPlayReminderScheduler extends IntervalScheduler {
    private readonly clock: () => Date

    constructor(options: { tickIntervalMs?: number; clock?: () => Date } = {}) {
        super(options.tickIntervalMs ?? HOUR_MS)
        this.clock = options.clock ?? (() => new Date())
    }

    protected onStart(): void {
        infoLog({
            message: `First-play reminder scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const now = this.clock().getTime()
        const welcomed = await getPrismaClient().activationEvent.findMany({
            where: {
                kind: 'onboarding_delivered',
                occurredAt: {
                    gte: new Date(now - REMINDER_UNTIL_MS),
                    lte: new Date(now - REMINDER_AFTER_MS),
                },
            },
            select: { guildDiscordId: true },
            distinct: ['guildDiscordId'],
        })
        if (welcomed.length === 0) return

        const outcomes: Partial<Record<ReminderOutcome, number>> = {}
        for (const { guildDiscordId } of welcomed) {
            const outcome = await this.remind(guildDiscordId)
            outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
        }
        if ((outcomes.sent ?? 0) + (outcomes.failed ?? 0) > 0) {
            infoLog({
                message: 'first-play reminder: tick',
                data: { candidates: welcomed.length, outcomes },
            })
        }
    }

    private async remind(guildId: string): Promise<ReminderOutcome> {
        try {
            const prisma = getPrismaClient()
            const reminded = await prisma.activationEvent.findFirst({
                where: { guildDiscordId: guildId, kind: 'first_play_reminder' },
                select: { id: true },
            })
            if (reminded) return 'already_reminded'

            const played = await prisma.trackHistory.findFirst({
                where: { guildId },
                select: { id: true },
            })
            if (played) return 'played'

            // Not in cache: the guild left, or Discord has it unavailable.
            const guild = this.client?.guilds.cache.get(guildId)
            if (!guild) return 'not_in_cache'

            const channel = findOnboardingChannel(guild)
            if (!channel || channel.type !== ChannelType.GuildText) {
                return 'no_channel'
            }

            // Recorded first: if the write fails nothing is sent. A failed
            // send keeps the record and is not retried, because a send that
            // threw may still have reached Discord, and a second reminder is
            // worse than a missed one. The 'failed' outcome in the tick log
            // tells such a guild apart from a delivered one.
            const recorded = await recordActivationEvent(
                guildId,
                'first_play_reminder',
            )
            if (!recorded) return 'failed'

            await channel.send({
                embeds: [await buildFirstPlayReminderEmbed(guild)],
                components: [await createOnboardingStationRow(guild)],
                allowedMentions: { parse: [] },
            })
            infoLog({
                message: 'first-play reminder: sent',
                data: { guildId },
            })
            return 'sent'
        } catch (error) {
            errorLog({
                message: 'first-play reminder: failed',
                error,
                data: { guildId },
            })
            return 'failed'
        }
    }
}

export async function buildFirstPlayReminderEmbed(
    guild: Guild,
): Promise<EmbedBuilder> {
    const t = await translatorForInteraction({ guildId: guild.id, guild })
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t('music.onboarding.reminderTitle'))
        .setDescription(t('music.onboarding.reminderDescription'))
        .setFooter({ text: 'Lucky' })
}

export const firstPlayReminderScheduler = new FirstPlayReminderScheduler()
