import type { Track, GuildQueue } from 'discord-player'
import { EmbedBuilder, type Message } from 'discord.js'
import type { TFunction } from 'i18next'
import { LRUCache } from 'lru-cache'
import { debugLog, warnLog } from '@lucky/shared/utils'
import { getAutoplayCount } from '../../utils/music/autoplayManager'
import { constants } from '@lucky/shared/config'
import { createNowPlayingButtons } from '../../utils/music/buttonComponents'
import {
    capitalizeFirst,
    formatTrackLine,
} from '../../utils/music/nowPlayingEmbed'
import { MUSIC_ACTION_STYLE } from '../../utils/music/musicActionStyle'
import { translatorForInteraction } from '../../i18n/translatorForInteraction'
import type { QueueMetadata } from '../../types/QueueMetadata'
import { getPerSourceAcceptanceRateCached } from '../../services/musicRecommendation/autoplay/autoplayAcceptanceCache'
import { getSkipReasonEmojis } from '../../utils/music/skipReasonMap'
import { trackAlbumPosition } from '../../utils/music/trackFields'
import { getStreamBridgeFallbackLabel } from './streamFallbackState'
import { clearLastFmTrackTiming } from './lastfmScrobbler'

/**
 * Track which guilds have logged a skip-reason prefill failure in this session.
 * Used to emit a ONCE-per-guild warning (not per-emoji spam) when emoji reactions fail.
 */
const prefillFailureLoggedGuilds = new Set<string>()

const DISCORD_API_ERROR_CODE_RE = /\b(\d{5})\b/

/**
 * Manages per-guild now-playing message state with automatic TTL + explicit cleanup
 * on guild lifecycle events (guildDelete, channelDelete).
 */
class TrackNowPlayingState {
    private readonly songInfoMessages = new LRUCache<
        string,
        { messageId: string; channelId: string; trackUrl?: string }
    >({
        max: 5000,
        ttl: 30 * 60 * 1000,
    })

    registerNowPlayingMessage(
        guildId: string,
        messageId: string,
        channelId: string,
        trackUrl?: string,
    ): void {
        this.songInfoMessages.set(guildId, { messageId, channelId, trackUrl })
    }

    getSongInfoMessage(
        guildId: string,
    ): { messageId: string; channelId: string; trackUrl?: string } | undefined {
        return this.songInfoMessages.get(guildId)
    }

    deleteSongInfoMessage(guildId: string): void {
        this.songInfoMessages.delete(guildId)
    }

    cleanupGuild(guildId: string): void {
        this.songInfoMessages.delete(guildId)
        clearLastFmTrackTiming(guildId)
        debugLog({
            message: 'Cleaned up now-playing state for guild',
            data: { guildId },
        })
    }
}

const trackNowPlayingState = new TrackNowPlayingState()

/**
 * Log a skip-reason emoji prefill failure for a guild (once per session).
 * Prevents per-emoji spam by tracking which guilds have already logged.
 */
function logEmojiPrefillFailure(guildId: string, error: unknown): void {
    if (prefillFailureLoggedGuilds.has(guildId)) {
        return
    }
    prefillFailureLoggedGuilds.add(guildId)
    const errorCode = extractErrorCode(error)
    warnLog({
        message: 'Failed to prefill skip-reason emojis on now-playing message',
        error,
        data: { guildId, errorCode },
    })
}

/**
 * Extract Discord API error code from an error object if present.
 * Used for diagnosing prefill failures (e.g., 50013 = Missing Permissions).
 */
function extractErrorCode(error: unknown): number | string | undefined {
    if (error instanceof Error) {
        // discord.js errors have a code property
        const discordError = error as unknown as { code?: number | string }
        if (discordError.code) return discordError.code
        // Try to extract from error message (e.g., "50013")
        const match = DISCORD_API_ERROR_CODE_RE.exec(error.message)
        if (match) return match[1]
    }
    return undefined
}

/**
 * Register an existing message as the "now playing" display for a guild.
 * Used by the /play command to pre-register its interaction reply so that
 * the playerStart handler edits it (with buttons) instead of sending a
 * duplicate "Now Playing" message.
 */
export function registerNowPlayingMessage(
    guildId: string,
    messageId: string,
    channelId: string,
    trackUrl?: string,
): void {
    trackNowPlayingState.registerNowPlayingMessage(
        guildId,
        messageId,
        channelId,
        trackUrl,
    )
}

export function getSongInfoMessage(
    guildId: string,
): { messageId: string; channelId: string; trackUrl?: string } | undefined {
    return trackNowPlayingState.getSongInfoMessage(guildId)
}

export function deleteSongInfoMessage(guildId: string): void {
    trackNowPlayingState.deleteSongInfoMessage(guildId)
}

export function cleanupGuildState(guildId: string): void {
    for (const key of unwritableChannels) {
        if (key.startsWith(`${guildId}:`)) unwritableChannels.delete(key)
    }
    trackNowPlayingState.cleanupGuild(guildId)
}

/** Longest recommendation reason kept in the footer. */
const REASON_LIMIT = 100

/**
 * Append the per-source acceptance rate to the recommendation reason.
 * Returns the original reason if the rate is unavailable or if reading fails.
 */
async function appendAcceptanceRate(
    reason: string,
    recommendationSource: string | undefined,
    guildId: string,
    t: TFunction,
): Promise<string> {
    // Graceful omission if source is not available
    if (!recommendationSource) {
        return reason
    }

    try {
        const rows = await getPerSourceAcceptanceRateCached(guildId)
        const sourceRow = rows.find((r) => r.source === recommendationSource)

        if (!sourceRow || sourceRow.acceptanceRate === null) {
            return reason
        }

        const ratePercent = Math.round(sourceRow.acceptanceRate * 100)
        return `${reason} · ${t('music.messages.accepted', { rate: ratePercent })}`
    } catch {
        // On any error (cache issue, service issue), omit the rate gracefully
        return reason
    }
}

async function prefillSkipReasonReactions(
    message: { react: (emoji: string) => Promise<unknown> },
    guildId: string,
    skipReasonEmojis: string[],
): Promise<{ successCount: number; attemptedCount: number }> {
    let successCount = 0
    const attemptedCount = skipReasonEmojis.length
    for (const emoji of skipReasonEmojis) {
        try {
            await message.react(emoji)
            successCount++
        } catch (error) {
            logEmojiPrefillFailure(guildId, error)
        }
    }
    return { successCount, attemptedCount }
}

/**
 * The skip-reason reactions only mean something on an autoplay pick. When the
 * reused message moves on to a requested track, take the bot's own reactions
 * back off (removing its own needs no permission).
 */
async function clearOwnReactions(
    message: Message,
    guildId: string,
): Promise<void> {
    const own = [...(message.reactions?.cache?.values() ?? [])].filter(
        (reaction) => reaction.me,
    )
    await Promise.all(
        own.map((reaction) =>
            // The whole reaction, listeners' votes included, needs Manage
            // Messages; without it, at least take the bot's own back.
            reaction
                .remove()
                .catch(() => reaction.users.remove())
                .catch((error: unknown) => {
                    debugLog({
                        message: 'Failed to remove skip-reason reaction',
                        error,
                        data: { guildId },
                    })
                }),
        ),
    )
}

function logPartialEmojiPrefill(
    guildId: string,
    successCount: number,
    attemptedCount: number,
): void {
    if (successCount === 0 || successCount >= attemptedCount) return
    debugLog({
        message: 'Partial emoji prefill: some emojis failed to react',
        data: { guildId, successCount, attemptedCount },
    })
}

/**
 * Try to edit the previous now-playing message in place instead of sending a
 * new one. Returns true on success (caller should stop); false means the
 * cached message is gone/stale and the caller should fall back to sending.
 */
async function tryUpdateExistingNowPlayingMessage(
    queue: GuildQueue,
    channel: NonNullable<QueueMetadata['channel']>,
    previousMessage: { messageId: string; channelId: string },
    opts: {
        embed: EmbedBuilder
        track: Track
        isAutoplay: boolean
        skipReasonEmojis: string[]
        moreLabel: string
    },
): Promise<boolean> {
    const { embed, track, isAutoplay, skipReasonEmojis, moreLabel } = opts
    try {
        const message = await channel.messages.fetch(previousMessage.messageId)
        await message.edit({
            content: null,
            embeds: [embed],
            components: [createNowPlayingButtons(queue, moreLabel)],
        })
        if (!isAutoplay) await clearOwnReactions(message, queue.guild.id)
        const { successCount, attemptedCount } =
            await prefillSkipReasonReactions(
                message,
                queue.guild.id,
                skipReasonEmojis,
            )
        logPartialEmojiPrefill(queue.guild.id, successCount, attemptedCount)
        // Refresh the cached trackUrl — the message is reused but now points
        // at a new track, so skip-reason reactions must resolve to it, not
        // the previous track's recommendation.
        registerNowPlayingMessage(
            queue.guild.id,
            previousMessage.messageId,
            channel.id,
            track.url,
        )
        debugLog({
            message: 'Updated now playing message in channel',
            data: {
                guildId: queue.guild.id,
                trackTitle: track.title,
                isAutoplay,
            },
        })
        return true
    } catch (error) {
        debugLog({
            message: 'Failed to update existing now playing message',
            error,
            data: {
                guildId: queue.guild.id,
                messageId: previousMessage.messageId,
            },
        })
        deleteSongInfoMessage(queue.guild.id)
        return false
    }
}

// Messages after the controls before they count as out of sight.
const BURIED_AFTER = 5

async function isBuried(
    channel: NonNullable<QueueMetadata['channel']>,
    messageId: string,
): Promise<boolean> {
    try {
        const newer = await channel.messages.fetch({
            after: messageId,
            limit: BURIED_AFTER,
        })
        return newer.size >= BURIED_AFTER
    } catch {
        return false
    }
}

// Edits, never deletes: the old message stays as history, only its buttons
// go, so there is still one set of controls in the channel. False when the
// buttons could not be removed, so the caller must not post a second copy.
async function removeButtonsQuietly(
    channel: NonNullable<QueueMetadata['channel']>,
    messageId: string,
): Promise<boolean> {
    try {
        const message = await channel.messages.fetch(messageId)
        await message.edit({ components: [] })
        return true
    } catch (error) {
        debugLog({
            message: 'Failed to remove buttons from buried now playing message',
            error,
            data: { messageId },
        })
        return false
    }
}

async function buildNowPlayingFooter(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
    t: TFunction,
): Promise<string> {
    const parts: string[] = []
    if (isAutoplay) {
        parts.push(t('music.messages.autoplay'))
        const metadata = (track.metadata ?? {}) as {
            recommendationReason?: string
            recommendationSource?: string
        }
        if (metadata.recommendationReason) {
            const reason =
                metadata.recommendationReason.length > REASON_LIMIT
                    ? `${metadata.recommendationReason.slice(0, REASON_LIMIT - 1)}…`
                    : metadata.recommendationReason
            parts.push(
                await appendAcceptanceRate(
                    reason,
                    metadata.recommendationSource,
                    queue.guild.id,
                    t,
                ),
            )
        }
        const autoplayCount = await getAutoplayCount(queue.guild.id)
        parts.push(
            t('music.messages.autoplayCount', {
                count: autoplayCount ?? 0,
                max: constants.MAX_AUTOPLAY_TRACKS ?? 50,
            }),
        )
    } else if (track.requestedBy) {
        parts.push(
            capitalizeFirst(
                t('music.messages.requestedBy', {
                    user: track.requestedBy.username,
                }),
            ),
        )
    }
    const albumPosition = trackAlbumPosition(track)
    if (albumPosition) {
        parts.push(t('music.messages.albumTrack', albumPosition))
    }
    // Subtle footnote when the streamBridge resolved via a fallback stage
    // instead of the primary yt-dlp source (#1769).
    const fallbackLabel = getStreamBridgeFallbackLabel(track)
    if (fallbackLabel) {
        parts.push(t('music.messages.viaFallback', { label: fallbackLabel }))
    }
    return parts.join(' · ')
}

/** One line, colored like every other now-playing reply (#2998). */
async function buildNowPlayingEmbed(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
    t: TFunction,
): Promise<EmbedBuilder> {
    const style = MUSIC_ACTION_STYLE.nowPlaying
    const embed = new EmbedBuilder()
        .setColor(style.color)
        .setDescription(
            `${style.emoji} ${t('music.messages.nowPlaying')} ${formatTrackLine(track, t)}`,
        )
    const footer = await buildNowPlayingFooter(queue, track, isAutoplay, t)
    if (footer) embed.setFooter({ text: footer })
    return embed
}

// Channels the bot cannot post in, keyed `guildId:channelId`: tried once, then
// skipped until the session ends (cleanupGuildState).
const unwritableChannels = new Set<string>()
const unwritableKey = (guildId: string, channelId: string): string =>
    `${guildId}:${channelId}`
const MISSING_ACCESS_CODES = new Set<number>([50001, 50013])

async function notifyRequesterOfMissingAccess(
    metadata: QueueMetadata,
    track: Track,
    t: TFunction,
): Promise<void> {
    try {
        const requester = track.requestedBy ?? metadata.requestedBy
        await requester?.send(t('music.messages.nowPlayingNoAccess'))
    } catch {
        // DMs may be closed; the warning log already records it
    }
}

// One send at a time per guild: two track starts at once would both see the
// same cached message as buried and each post a copy of the controls.
const sendChains = new Map<string, Promise<void>>()

export function sendNowPlayingEmbed(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
): Promise<void> {
    const guildId = queue.guild.id
    const run = (sendChains.get(guildId) ?? Promise.resolve()).then(() =>
        sendNowPlayingEmbedNow(queue, track, isAutoplay),
    )
    const tail = run.catch(() => undefined)
    sendChains.set(guildId, tail)
    void tail.then(() => {
        if (sendChains.get(guildId) === tail) sendChains.delete(guildId)
    })
    return run
}

async function sendNowPlayingEmbedNow(
    queue: GuildQueue,
    track: Track,
    isAutoplay: boolean,
): Promise<void> {
    const metadata = queue.metadata as QueueMetadata | undefined
    if (!metadata?.channel) return
    if (
        unwritableChannels.has(
            unwritableKey(queue.guild.id, metadata.channel.id),
        )
    ) {
        return
    }

    const t = await translatorForInteraction({
        guildId: queue.guild.id,
        guild: queue.guild,
    })
    const embed = await buildNowPlayingEmbed(queue, track, isAutoplay, t)
    // Skip reasons tune autoplay, so only an autoplay pick asks for one.
    const skipReasonEmojis = isAutoplay ? getSkipReasonEmojis() : []
    const moreLabel = t('music.messages.moreControls')

    const previousMessage = getSongInfoMessage(queue.guild.id)
    const sameChannel =
        previousMessage && previousMessage.channelId === metadata.channel.id
    if (
        sameChannel &&
        (await isBuried(metadata.channel, previousMessage.messageId)) &&
        // Chat moved on: post the controls again at the bottom once the old
        // copy lost its buttons, so only one message has controls. If that
        // edit fails, update the old message in place instead.
        (await removeButtonsQuietly(
            metadata.channel,
            previousMessage.messageId,
        ))
    ) {
        deleteSongInfoMessage(queue.guild.id)
    } else if (sameChannel) {
        const updated = await tryUpdateExistingNowPlayingMessage(
            queue,
            metadata.channel,
            previousMessage,
            { embed, track, isAutoplay, skipReasonEmojis, moreLabel },
        )
        if (updated) return
    }

    let message: Message
    try {
        message = await metadata.channel.send({
            embeds: [embed],
            components: [createNowPlayingButtons(queue, moreLabel)],
        })
    } catch (error) {
        const code = extractErrorCode(error)
        if (code === undefined || !MISSING_ACCESS_CODES.has(Number(code))) {
            throw error
        }
        unwritableChannels.add(
            unwritableKey(queue.guild.id, metadata.channel.id),
        )
        warnLog({
            message:
                'Now playing message skipped: bot cannot write to the music channel',
            data: {
                guildId: queue.guild.id,
                channelId: metadata.channel.id,
                errorCode: code,
            },
        })
        await notifyRequesterOfMissingAccess(metadata, track, t)
        return
    }

    const { successCount, attemptedCount } = await prefillSkipReasonReactions(
        message,
        queue.guild.id,
        skipReasonEmojis,
    )

    registerNowPlayingMessage(
        queue.guild.id,
        message.id,
        metadata.channel.id,
        track.url,
    )

    // Log first-message diagnostic: track successful vs attempted emoji prefills
    debugLog({
        message: 'Sent now playing message to channel',
        data: {
            guildId: queue.guild.id,
            trackTitle: track.title,
            isAutoplay,
            emojiPrefill: {
                successCount,
                attemptedCount,
                allSuccessful: successCount === attemptedCount,
            },
        },
    })
}
