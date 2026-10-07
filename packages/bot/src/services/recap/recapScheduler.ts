import type { Client, Guild, TextChannel } from 'discord.js'
import { AttachmentBuilder, ChannelType, PermissionFlagsBits } from 'discord.js'
import { getWeeklyRecap, type RecapPayload } from '@lucky/shared/services'
import { debugLog, errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import { IntervalScheduler } from '../../utils/general/IntervalScheduler'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import { isRecapRenderEnabled } from '../../config/featureFlags'
import {
    recapCardPostedTotal,
    renderFallbackTotal,
} from '../../utils/monitoring/prometheus'
import { renderRecapCard } from './recapCard'
import { buildRecapEmbed } from './recapEmbed'
import type { RenderFailureReason } from './recapRenderClient'
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

type FallbackReason = RenderFailureReason | 'disabled' | 'no_attach_permission'

const CARD_FILE = 'recap.jpg'

/**
 * Attach Files is deliberately NOT here: it would make a channel without it
 * "unusable" and clear the opt-in. Missing it only drops the image card.
 */
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
    | { channel: TextChannel; canAttach: boolean }
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
    const permissions = channel.permissionsFor(me)
    if (!permissions?.has(RECAP_POST_PERMISSIONS)) {
        return { reason: 'missing_permissions' }
    }
    // Attach Files is optional: without it the recap posts as text only.
    return {
        channel,
        canAttach: permissions.has(PermissionFlagsBits.AttachFiles),
    }
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

    /** The card JPEG, or null after counting and logging why it fell back. */
    private async renderCard(
        recap: RecapPayload,
        guildId: string,
        canAttach: boolean,
    ): Promise<Buffer | null> {
        let reason: FallbackReason
        if (!isRecapRenderEnabled()) {
            reason = 'disabled'
        } else if (!canAttach) {
            reason = 'no_attach_permission'
        } else {
            const result = await renderRecapCard(recap)
            if (result.ok) return result.jpeg
            reason = result.reason
        }
        renderFallbackTotal.labels(reason).inc()
        // 'disabled' is a deliberate operator choice, not worth a warning.
        if (reason !== 'disabled') {
            warnLog({
                message: 'recap: card unavailable, posting text embed',
                data: { guildId, reason },
            })
        }
        return null
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
            // The card is built before the claim: a crash in the slow render
            // window then leaves the week unclaimed to retry, and a lost claim
            // only wastes the render. A render failure is never a send failure.
            const card =
                recap.plays >= RECAP_MIN_PLAYS
                    ? await this.renderCard(recap, guildId, target.canAttach)
                    : null
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
            // Built per message: setImage mutates, and the text retry must
            // not carry the attachment reference.
            const textOnly = () => ({
                embeds: [buildRecapEmbed(recap, t)],
                allowedMentions: { parse: [] },
            })
            try {
                try {
                    await target.channel.send(
                        card
                            ? {
                                  embeds: [
                                      buildRecapEmbed(recap, t).setImage(
                                          `attachment://${CARD_FILE}`,
                                      ),
                                  ],
                                  files: [
                                      new AttachmentBuilder(card, {
                                          name: CARD_FILE,
                                          description: t('music.recap.cardAlt'),
                                      }),
                                  ],
                                  allowedMentions: { parse: [] },
                              }
                            : textOnly(),
                    )
                    // Only a resolved send that carried the card counts.
                    if (card) recapCardPostedTotal.inc()
                } catch (error) {
                    // Attach Files revoked between the check and the send: the
                    // text embed may still go through, so try it once before
                    // treating the channel as gone.
                    if (
                        !card ||
                        Number((error as { code?: unknown }).code) !== 50013
                    ) {
                        throw error
                    }
                    renderFallbackTotal.labels('no_attach_permission').inc()
                    warnLog({
                        message: 'recap: card refused, retrying as text',
                        data: { guildId },
                    })
                    await target.channel.send(textOnly())
                }
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
