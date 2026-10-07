import type { Client, Guild, TextChannel } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { getWeeklyRecap } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { IntervalScheduler } from '../../utils/general/IntervalScheduler'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { buildRecapEmbed } from './recapEmbed'
import { latestRecapBoundary, recapWindow } from './recapWindow'
import {
    claimRecapWeek,
    disableRecap,
    listDueRecaps,
    releaseRecapWeek,
} from './recapStore'

const HOUR_MS = 60 * 60 * 1000
/** Below this many plays in the week the recap is skipped, not posted empty. */
export const RECAP_MIN_PLAYS = 5

export const RECAP_POST_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
]

/**
 * Discord codes meaning the bot cannot post in the channel until someone acts:
 * Unknown Channel, Missing Access, Missing Permissions.
 */
const CHANNEL_GONE_CODES = new Set([10003, 50001, 50013])

function isChannelGone(error: unknown): boolean {
    return CHANNEL_GONE_CODES.has(Number((error as { code?: unknown }).code))
}

/**
 * The text channel the bot can post the recap in, or why it cannot. Only a
 * definite answer from Discord becomes a reason; a transient failure (5xx,
 * rate limit, network) throws so the caller retries instead of opting out.
 */
export async function resolveRecapChannel(
    guild: Guild,
    channelId: string,
): Promise<
    | { channel: TextChannel }
    | { reason: 'missing_channel' | 'missing_permissions' }
> {
    let channel
    try {
        channel = await guild.channels.fetch(channelId)
    } catch (error) {
        if (isChannelGone(error)) return { reason: 'missing_channel' }
        throw error
    }
    if (!channel || channel.type !== ChannelType.GuildText) {
        return { reason: 'missing_channel' }
    }
    const me = guild.members.me ?? (await guild.members.fetchMe())
    const canPost =
        channel.permissionsFor(me)?.has(RECAP_POST_PERMISSIONS) ?? false
    return canPost ? { channel } : { reason: 'missing_permissions' }
}

type RecapSchedulerOptions = {
    tickIntervalMs?: number
    clock?: () => Date
}

/**
 * Posts the weekly recap (#2678). Hourly tick; a guild is due once the most
 * recent Sunday 18:00 UTC is later than its last post, so a restart or a missed
 * hour posts on the next tick. Each week is claimed before it is sent, so it
 * never posts twice; a transient send failure releases the claim to retry. Guilds are processed one at a time: about 50 guilds,
 * each a few queries and one message.
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
                await disableRecap(guildId, channelId)
                warnLog({
                    message: 'recap: channel unusable, opt-in cleared',
                    data: { guildId, channelId, reason: target.reason },
                })
                return
            }

            const { from, to } = recapWindow(boundary)
            const recap = await getWeeklyRecap(guildId, from, to)
            // Claimed even when the week is too quiet to post, so it is not
            // re-read every hour; a false claim means /recap changed meanwhile.
            const claimedAt = this.clock()
            const claimed = await claimRecapWeek(
                guildId,
                channelId,
                boundary,
                claimedAt,
            )
            if (!claimed) {
                debugLog({
                    message: 'recap: settings changed since listing, skipped',
                    data: { guildId },
                })
                return
            }
            if (recap.plays < RECAP_MIN_PLAYS) {
                debugLog({
                    message: 'recap: too few plays, skipped',
                    data: { guildId, plays: recap.plays },
                })
                return
            }

            const t = await translatorForInteraction({ guildId, guild })
            try {
                await target.channel.send({
                    embeds: [buildRecapEmbed(recap, t)],
                    allowedMentions: { parse: [] },
                })
            } catch (error) {
                if (isChannelGone(error)) {
                    // Lost access between the check and the send.
                    await disableRecap(guildId, channelId)
                    warnLog({
                        message: 'recap: send refused, opt-in cleared',
                        data: { guildId, channelId },
                    })
                    return
                }
                await releaseRecapWeek(guildId, claimedAt)
                throw error
            }
            infoLog({
                message: 'recap: posted',
                data: { guildId, plays: recap.plays },
            })
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
