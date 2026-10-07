import type { Client, Guild, TextChannel } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { getWeeklyRecap } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { IntervalScheduler } from '../../utils/general/IntervalScheduler'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { buildRecapEmbed } from './recapEmbed'
import { latestRecapBoundary, recapWindow } from './recapWindow'
import { disableRecap, listDueRecaps, markRecapPosted } from './recapStore'

const HOUR_MS = 60 * 60 * 1000
/** Below this many plays in the week the recap is skipped, not posted empty. */
export const RECAP_MIN_PLAYS = 5

export const RECAP_POST_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

/** The text channel the bot can post the recap in, or why it cannot. */
export async function resolveRecapChannel(
    guild: Guild,
    channelId: string,
): Promise<
    | { channel: TextChannel }
    | { reason: 'missing_channel' | 'missing_permissions' }
> {
    const channel = await guild.channels.fetch(channelId).catch(() => null)
    if (!channel || channel.type !== ChannelType.GuildText) {
        return { reason: 'missing_channel' }
    }
    const me = guild.members.me
    const canPost =
        !!me &&
        (channel.permissionsFor(me)?.has(RECAP_POST_PERMISSIONS) ?? false)
    return canPost ? { channel } : { reason: 'missing_permissions' }
}

type RecapSchedulerOptions = {
    tickIntervalMs?: number
    clock?: () => Date
}

/**
 * Posts the weekly recap (#2678). Hourly tick; a guild is due once the most
 * recent Sunday 18:00 UTC is later than its last post, so a restart or a missed
 * hour posts on the next tick and never twice. Guilds are processed one at a
 * time: about 50 guilds, each a few queries and one message.
 */
export class RecapScheduler extends IntervalScheduler {
    private readonly clock: () => Date

    constructor(options: RecapSchedulerOptions = {}) {
        super(options.tickIntervalMs ?? HOUR_MS)
        this.clock = options.clock ?? (() => new Date())
    }

    protected onStart(): void {
        infoLog({
            message: `Recap scheduler started (interval: ${this.tickIntervalMs}ms)`,
        })
        void this.tick()
    }

    protected async execute(): Promise<void> {
        const boundary = latestRecapBoundary(this.clock())
        const due = await listDueRecaps(boundary)
        for (const { guildId, channelId } of due) {
            await this.postForGuild(guildId, channelId, boundary)
        }
    }

    private async postForGuild(
        guildId: string,
        channelId: string,
        boundary: Date,
    ): Promise<void> {
        try {
            const guild = this.client?.guilds.cache.get(guildId)
            if (!guild) {
                debugLog({
                    message: 'recap: guild not in cache, skipping',
                    data: { guildId },
                })
                return
            }

            const target = await resolveRecapChannel(guild, channelId)
            if ('reason' in target) {
                await disableRecap(guildId)
                warnLog({
                    message: 'recap: channel unusable, opt-in cleared',
                    data: { guildId, channelId, reason: target.reason },
                })
                return
            }

            const { from, to } = recapWindow(boundary)
            const recap = await getWeeklyRecap(guildId, from, to)
            if (recap.plays >= RECAP_MIN_PLAYS) {
                const t = await translatorForInteraction({ guildId, guild })
                await target.channel.send({
                    embeds: [buildRecapEmbed(recap, t)],
                    allowedMentions: { parse: [] },
                })
                infoLog({
                    message: 'recap: posted',
                    data: { guildId, plays: recap.plays },
                })
            } else {
                debugLog({
                    message: 'recap: too few plays, skipped',
                    data: { guildId, plays: recap.plays },
                })
            }
            // Marked even when skipped, so a quiet week is not re-read every hour.
            await markRecapPosted(guildId, this.clock())
        } catch (error) {
            errorLog({
                message: 'recap: failed to post',
                error,
                data: { guildId },
            })
        }
    }
}

export const recapScheduler = new RecapScheduler()

export function startRecapScheduler(client: Client): void {
    recapScheduler.start(client)
}

export function stopRecapScheduler(): void {
    recapScheduler.stop()
}
