import type {
    ChatInputCommandInteraction,
    GuildMember,
    VoiceBasedChannel,
} from 'discord.js'
import type { TFunction } from 'i18next'
import type {
    PlayerNodeInitializationResult,
    QueryType,
    SearchResult,
    Track,
} from 'discord-player'
import type { CommandExecuteParams } from '../../../../../types/CommandData'
import { ENVIRONMENT_CONFIG } from '@lucky/shared/config'
import { errorLog, debugLog, warnLog } from '@lucky/shared/utils'
import { markCommandOutcome } from '../../../../../utils/monitoring/commandOutcome'
import { assertDefined } from '@lucky/shared/utils/guards'
import { createErrorEmbed } from '../../../../../utils/general/embeds'
import { interactionReply } from '../../../../../utils/general/interactionReply'
import { moveUserTrackToPriority } from '../../../../../services/musicManagement/queueManipulation'
import { buildPlayResponseEmbed } from '../../../../../utils/music/nowPlayingEmbed'
import { registerNowPlayingMessage } from '../../../../../handlers/player/nowPlayingDisplay'
import { buildStreamFailedEmbed } from '../../../../../handlers/player/streamFailureNotifier'
import { resolveGuildQueue } from '../../../../../services/musicManagement/queueResolver'
import {
    isUnknownInteractionError,
    resolveSearchEngine,
    prepareQuery,
    replyYoutubeDisabledIfNeeded,
    stampPlaylistTracks,
} from '../queryUtils'
import { parseYoutubeLink } from '../queryDetector'
import { translatorForInteraction } from '../../../../../i18n/translatorForInteraction'
import { translatorFor } from '../../../../../i18n'
import {
    resolveQueryWithFallbacks,
    emitPlayResolutionTelemetry,
    type ResolveQueryParams,
} from './resolveProvider'
import { runPostPlayBackgroundOps } from './postPlayBackgroundOps'
import {
    reserveCollaborativeRequest,
    type CollaborativeReservation,
} from './collaborativeLimit'
import { playSpotifyArtistLink, spotifyArtistId } from './spotifyArtistLink'
import {
    classifyPlayFailure,
    logPlayFailure,
    resolvePlayErrorMessage,
} from './playErrorMessage'
import { watchStreamStartFailures } from './streamStartWatcher'
import {
    queueLeaveOptionsFor,
    type QueueLeaveOptions,
} from '../../../../../services/musicManagement/queueLeaveOptions'
import {
    closePlayStartWatch,
    openPlayStartWatch,
    waitForPlayStartOutcome,
    type PlayStartWatch,
} from '../../../../../handlers/player/playStartWatch'

// Stream recovery searches for up to 10 s before giving up (streamRecovery.ts).
const RECOVERY_OUTCOME_WAIT_MS = 15_000

type QueuedEmbedInput = {
    searchResult: SearchResult
    track: Track
    interaction: ChatInputCommandInteraction
    queuePosition: number
    t: TFunction
}

function buildQueuedEmbed({
    searchResult,
    track,
    interaction,
    queuePosition,
    t,
}: QueuedEmbedInput) {
    return searchResult.playlist
        ? buildPlayResponseEmbed(
              {
                  kind: 'playlistQueued',
                  track,
                  requestedBy: interaction.user,
                  playlist: {
                      title: searchResult.playlist.title,
                      trackCount: searchResult.tracks.length,
                      url: searchResult.playlist.url,
                  },
              },
              t,
          )
        : buildPlayResponseEmbed(
              {
                  kind: queuePosition > 0 ? 'addedToQueue' : 'nowPlaying',
                  track,
                  requestedBy: interaction.user,
                  queuePosition,
              },
              t,
          )
}

/** The guild's language, or English when it cannot be read. */
async function resolveTranslator(
    interaction: ChatInputCommandInteraction,
): Promise<TFunction> {
    try {
        return await translatorForInteraction(interaction)
    } catch {
        return translatorFor('en')
    }
}

/** The reply sent as soon as the search resolved, before audio starts. */
type EarlyReply = {
    track: Track
    queuePosition: number
    sent: Promise<void>
}

function isSameResolvedTrack(a: Track, b: Track): boolean {
    return a === b || (Boolean(b.id) && a.id === b.id)
}

/**
 * Edits the original (deferred) reply in place. `interactionReply` cannot be
 * used for a second write: once the first edit landed `interaction.replied`
 * is true and it would post a follow-up message instead of editing.
 * Returns false when the edit failed (expired token, deleted message).
 */
async function editOriginalReply(
    interaction: ChatInputCommandInteraction,
    embed: unknown,
): Promise<boolean> {
    try {
        await interaction.editReply({ embeds: [embed as never] })
        return true
    } catch (error) {
        debugLog({
            message: 'Could not edit the original /play reply',
            data: { guildId: interaction.guildId, error: String(error) },
        })
        return false
    }
}

/**
 * Replaces the "added to queue" reply with an error. If the interaction can no
 * longer be edited (token expired after 15 minutes, message deleted), sends it
 * to the channel instead so the user is not left with a stale success.
 */
async function replaceReplyWithError(
    interaction: ChatInputCommandInteraction,
    embed: unknown,
): Promise<void> {
    if (await editOriginalReply(interaction, embed)) return
    const channel = interaction.channel
    try {
        if (channel && 'send' in channel) {
            await channel.send({ embeds: [embed as never] })
            return
        }
    } catch (error) {
        warnLog({
            message: 'Failed to send play failure follow-up to channel',
            error,
            data: { guildId: interaction.guildId },
        })
        return
    }
    warnLog({
        message: 'No way to report play failure to the user',
        data: { guildId: interaction.guildId },
    })
}

type PlayContext = {
    client: CommandExecuteParams['client']
    interaction: ChatInputCommandInteraction
    guildId: string
    voiceChannel: VoiceBasedChannel
    query: string
    provider: string | null
    t: TFunction
    commandStartedAt: number
    reservation: CollaborativeReservation
}

/** Written by the search callback while play() is still awaiting voice. */
type EarlyState = { reply: EarlyReply | null; watch: PlayStartWatch | null }

type GuildQueue = ReturnType<typeof resolveGuildQueue>['queue']

async function replyNotInGuild(
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    await interactionReply({
        interaction,
        content: {
            embeds: [
                createErrorEmbed(
                    'Error',
                    'This command can only be used in a server',
                ),
            ],
            ephemeral: true,
        },
    })
}

/** Defers the reply. False when the interaction already expired. */
async function deferPlayReply(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    try {
        await interaction.deferReply()
        return true
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            markCommandOutcome(interaction, {
                outcome: 'error',
                errorClass: 'InteractionExpired',
            })
            return false
        }
        throw error
    }
}

async function registerDeferredNowPlaying(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    channelId: string,
): Promise<void> {
    try {
        const deferredMsg = await interaction.fetchReply()
        registerNowPlayingMessage(guildId, deferredMsg.id, channelId)
    } catch (error) {
        // Non-fatal: playerStart sends its own message if this fails.
        // Logged because an empty catch made the double failure
        // (this AND playerStart) indistinguishable from success -
        // the user got no now-playing message and nothing was
        // recorded anywhere (#1993).
        warnLog({
            message: 'Failed to register now-playing message',
            data: {
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                error: String(error),
            },
        })
    }
}

function buildPlayOptions(
    ctx: PlayContext,
    searchEngine: QueryType,
    leaveOptions: QueueLeaveOptions,
) {
    const { client, interaction, voiceChannel } = ctx
    const vcMemberIds = voiceChannel.members
        ? Array.from(voiceChannel.members.values())
              .filter((m) => m.id !== client.user?.id)
              .map((m) => m.id)
        : []
    return {
        nodeOptions: {
            metadata: {
                channel: interaction.channel,
                requestedBy: interaction.user,
                vcMemberIds,
            },
            connectionTimeout: ENVIRONMENT_CONFIG.PLAYER.CONNECTION_TIMEOUT,
            ...leaveOptions,
        },
        requestedBy: interaction.user,
        searchEngine,
    }
}

/**
 * Answers as soon as the search found something, so the user is not waiting
 * out the voice connect and the stream bridge (about 6 s on a cold Spotify
 * play). Not awaited: the edit runs while discord-player connects. The
 * now-playing message later overwrites the same message.
 */
function createEarlyReplier(
    ctx: PlayContext,
    early: EarlyState,
    hadQueueBeforePlay: boolean,
): (searchResult: SearchResult) => void {
    const { client, interaction, guildId, t, commandStartedAt } = ctx
    return (searchResult) => {
        const found = searchResult.tracks[0]
        if (!found || (!searchResult.playlist && !found.title)) return
        if (!searchResult.playlist) {
            // Lets stream recovery hand its outcome to this command
            // instead of messaging the channel (see playStartWatch.ts).
            if (early.watch) early.watch.track = found
            else early.watch = openPlayStartWatch(guildId, found)
        }
        if (early.reply) return
        const queueNow = resolveGuildQueue(client, guildId).queue
        const queuePosition =
            hadQueueBeforePlay && queueNow ? queueNow.tracks.size + 1 : 0
        const embed = buildQueuedEmbed({
            searchResult,
            track: found,
            interaction,
            queuePosition,
            t,
        })
        early.reply = {
            track: found,
            queuePosition,
            sent: interactionReply({
                interaction,
                content: { embeds: [embed] },
            }).catch(() => undefined),
        }
        debugLog({
            message: 'Play: early reply sent after search',
            data: { guildId, replyAfterMs: Date.now() - commandStartedAt },
        })
    }
}

function emitFailedResolutionTelemetry(
    provider: string | null,
    resolutionStartedAt: number,
    error: unknown,
): void {
    const resolutionTelemetry = {
        resolvedVia: 'failed' as const,
        latencyMs: Date.now() - resolutionStartedAt,
        requestedProvider: provider ?? 'default',
        errorClass: (error as Error).constructor.name,
    }
    try {
        emitPlayResolutionTelemetry(resolutionTelemetry)
    } catch {
        // Telemetry failure must not break play error handling
    }
}

async function resolvePlayWithTelemetry(
    params: ResolveQueryParams,
    provider: string | null,
): Promise<PlayerNodeInitializationResult<unknown>> {
    const resolutionStartedAt = Date.now()
    try {
        const resolution = await resolveQueryWithFallbacks(params)
        emitPlayResolutionTelemetry(resolution.telemetry)
        return resolution.result
    } catch (error) {
        emitFailedResolutionTelemetry(provider, resolutionStartedAt, error)
        throw error
    }
}

/**
 * Recovery may still start a replacement (YouTube search) or give up. Say
 * "could not start" only if it gave up; it does not message the channel while
 * this command is watching. Returns true when the failure was reported.
 */
async function reportStartFailureIfGaveUp(
    ctx: PlayContext,
    early: EarlyState,
    track: Track,
): Promise<boolean> {
    const outcome = early.watch
        ? await waitForPlayStartOutcome(early.watch, RECOVERY_OUTCOME_WAIT_MS)
        : 'gave_up'
    if (outcome === 'gave_up') {
        await reportStartFailure(ctx.interaction, early.reply, track, ctx.t)
        return true
    }
    debugLog({
        message:
            outcome === 'recovered'
                ? 'Play: stream recovered with a replacement track, keeping the reply'
                : 'Play: stream recovery outcome unknown, keeping the reply',
        data: { guildId: ctx.guildId, title: track.title },
    })
    return false
}

function resolveQueuePosition(
    queue: GuildQueue,
    track: Track,
    hadQueueBeforePlay: boolean,
): number {
    const queuedTracks = queue ? (queue.tracks.toArray?.() ?? []) : []
    const trackIndex = queuedTracks.findIndex((queued) =>
        isSameResolvedTrack(queued, track),
    )
    // A track in the upcoming list is queued even when the pre-play
    // snapshot saw no queue (a concurrent /play created it first).
    if (trackIndex >= 0) return trackIndex + 1
    if (hadQueueBeforePlay && queue) return queuedTracks.length
    return 0
}

async function sendFinalReply(
    interaction: ChatInputCommandInteraction,
    earlyReply: EarlyReply | null,
    embed: ReturnType<typeof buildQueuedEmbed>,
    track: Track,
    queuePosition: number,
): Promise<void> {
    if (!earlyReply) {
        await interactionReply({
            interaction,
            content: { embeds: [embed] },
        })
        return
    }
    // The early embed was built before the track was added, so its
    // position is an estimate (and a fallback arm may have resolved a
    // different track). Correct it only when it differs.
    await earlyReply.sent
    if (
        !isSameResolvedTrack(earlyReply.track, track) ||
        earlyReply.queuePosition !== queuePosition
    ) {
        await editOriginalReply(interaction, embed)
    }
}

type PlayCompletion = {
    result: PlayerNodeInitializationResult<unknown>
    isPlaylist: boolean
    hadQueueBeforePlay: boolean
}

/** Queue position, final reply, contribution and background ops. */
async function completePlay(
    ctx: PlayContext,
    early: EarlyState,
    { result, isPlaylist, hadQueueBeforePlay }: PlayCompletion,
): Promise<void> {
    const { client, interaction, guildId, t } = ctx
    const track = result.track
    const { queue } = resolveGuildQueue(client, guildId)

    if (!isPlaylist && queue) {
        moveUserTrackToPriority(queue, track)
    }

    const queuePosition = resolveQueuePosition(queue, track, hadQueueBeforePlay)
    const embed = buildQueuedEmbed({
        searchResult: result.searchResult,
        track,
        interaction,
        queuePosition,
        t,
    })

    await sendFinalReply(interaction, early.reply, embed, track, queuePosition)

    // Fire-and-forget: each op is isolated inside runPostPlayBackgroundOps so a
    // single failure never silently skips the others (#1085).
    //
    // Not awaited: these are background ops by design and the user-facing
    // reply has already been sent, so awaiting would hold the command open
    // on work the user is not waiting for. The catch is what #1997 was
    // actually missing: anything escaping the internal isolation used to
    // vanish into an unhandled rejection.
    void runPostPlayBackgroundOps({
        queue,
        guildId,
        track,
        hadQueueBeforePlay,
        isPlaylist,
        recapTarget:
            interaction.guild && interaction.channelId
                ? {
                      guild: interaction.guild,
                      channelId: interaction.channelId,
                  }
                : null,
    }).catch((error: unknown) => {
        errorLog({
            message: 'Post-play background ops failed',
            error,
            data: { guildId, track: track?.title },
        })
    })
}

/** Searches, plays and replies. Throws on any failure; the caller reports it. */
async function runPlay(ctx: PlayContext, early: EarlyState): Promise<void> {
    const { client, interaction, guildId, voiceChannel, query, provider } = ctx
    const hadQueueBeforePlay = Boolean(resolveGuildQueue(client, guildId).queue)

    if (!hadQueueBeforePlay && interaction.channelId) {
        await registerDeferredNowPlaying(
            interaction,
            guildId,
            interaction.channelId,
        )
    }

    const searchEngine = resolveSearchEngine(query, provider)
    // nodeOptions only matter when play() creates the queue, but the queue
    // seen above can be deleted while the search runs, so always read the
    // guild's 24/7 setting rather than trusting that snapshot.
    const leaveOptions = await queueLeaveOptionsFor(guildId)
    const playOptions = buildPlayOptions(ctx, searchEngine, leaveOptions)
    const startWatcher = watchStreamStartFailures(client.player, guildId)
    const replyOnceSearched = createEarlyReplier(ctx, early, hadQueueBeforePlay)

    let result: PlayerNodeInitializationResult<unknown>
    try {
        result = await resolvePlayWithTelemetry(
            {
                player: client.player,
                voiceChannel,
                query,
                requestedProvider: provider ?? 'default',
                searchEngine,
                playOptions,
                onSearchResolved: replyOnceSearched,
            },
            provider,
        )
    } finally {
        startWatcher.dispose()
    }

    const track = result.track
    const isPlaylist = stampPlaylistTracks(result.searchResult)

    // discord-player does not throw to this caller when every stream
    // source fails: it skips the track and resolves play() as if it had
    // started. Say so instead of leaving "added to queue" on screen.
    const startFailed = !isPlaylist && startWatcher.hasFailed(track)
    // Only a failed start still needs the hand-off; a track that fails
    // later must reach the regular channel notification.
    if (!startFailed && early.watch) closePlayStartWatch(early.watch)

    if (startFailed && (await reportStartFailureIfGaveUp(ctx, early, track))) {
        return
    }

    // Something was queued and started: the request counts.
    ctx.reservation.commit()
    await completePlay(ctx, early, { result, isPlaylist, hadQueueBeforePlay })
}

async function sendEphemeralPlayError(
    interaction: ChatInputCommandInteraction,
    errorEmbed: ReturnType<typeof createErrorEmbed>,
): Promise<void> {
    try {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed],
                ephemeral: true,
            },
        })
    } catch (replyError) {
        warnLog({
            message: 'Failed to send play command error reply',
            error: replyError,
            data: { guildId: interaction.guildId },
        })
    }
}

async function reportPlayFailure(
    ctx: PlayContext,
    early: EarlyState,
    error: unknown,
): Promise<void> {
    const { interaction, query, t } = ctx
    if (isUnknownInteractionError(error)) {
        debugLog({
            message: 'Play command interaction expired before reply',
            data: { query, guildId: interaction.guildId },
        })
        markCommandOutcome(interaction, {
            outcome: 'error',
            errorClass: 'InteractionExpired',
        })
        return
    }

    logPlayFailure('Play command error:', error, {
        query,
        guildId: interaction.guildId,
    })
    markCommandOutcome(interaction, classifyPlayFailure(error))

    const errorEmbed = createErrorEmbed(
        'Play Error',
        resolvePlayErrorMessage(error, query, t),
    )

    if (early.reply) {
        // The user already has a success reply: replace it, do not stack
        // an ephemeral follow-up under it.
        await early.reply.sent
        await replaceReplyWithError(interaction, errorEmbed)
        return
    }

    await sendEphemeralPlayError(interaction, errorEmbed)
}

export async function executePlayHandler({
    client,
    interaction,
}: CommandExecuteParams): Promise<void> {
    const guildId = interaction.guildId
    if (!guildId) {
        await replyNotInGuild(interaction)
        return
    }

    const commandStartedAt = Date.now()
    const member = interaction.member as GuildMember
    const voiceChannel = assertDefined(
        member.voice.channel,
        'Voice channel guaranteed by requireVoiceChannel check',
    )

    const rawQuery = interaction.options.getString('query', true)
    const provider = interaction.options.getString('provider')

    // Checked on the raw query, before deferring, so the "YouTube is
    // unavailable" notice can still be its own ephemeral reply instead of
    // editing the public defer below, which would strip the ephemeral flag.
    // Safe on the raw query: SoundCloud expansion/normalization below never
    // changes a youtube.com/youtu.be host.
    // A video or playlist link is not stopped here: resolveQueryWithFallbacks
    // searches a video's title on Spotify/SoundCloud and answers a playlist
    // with its own message, with or without YouTube.
    if (
        !parseYoutubeLink(rawQuery) &&
        (await replyYoutubeDisabledIfNeeded(interaction, rawQuery, provider))
    ) {
        markCommandOutcome(interaction, { outcome: 'user_error' })
        return
    }

    if (!(await deferPlayReply(interaction))) return

    const t = await resolveTranslator(interaction)
    const reservation = await reserveCollaborativeRequest(interaction, guildId)
    if (!reservation) return
    const query = await prepareQuery(rawQuery, provider)

    // A YouTube or SoundCloud provider choice keeps its own search.
    const artistId =
        provider && provider !== 'spotify' ? null : spotifyArtistId(query)
    if (artistId) {
        try {
            await playSpotifyArtistLink({
                client,
                interaction,
                voiceChannel,
                artistId,
                reservation,
            })
        } finally {
            reservation.settle()
        }
        return
    }

    const ctx: PlayContext = {
        client,
        interaction,
        guildId,
        voiceChannel,
        query,
        provider,
        t,
        commandStartedAt,
        reservation,
    }
    // Written by the search callback while play() is still awaiting voice
    // and stream; read by the final reconcile and by the catch below.
    const early: EarlyState = { reply: null, watch: null }

    try {
        await runPlay(ctx, early)
    } catch (error) {
        await reportPlayFailure(ctx, early, error)
    } finally {
        if (early.watch) closePlayStartWatch(early.watch)
        reservation.settle()
    }
}

async function reportStartFailure(
    interaction: ChatInputCommandInteraction,
    earlyReply: EarlyReply | null,
    track: Track,
    t: TFunction,
): Promise<void> {
    warnLog({
        message: 'Play: track could not be started, replying with failure',
        data: { guildId: interaction.guildId, title: track.title },
    })
    markCommandOutcome(interaction, {
        outcome: 'error',
        errorClass: 'StreamStartFailed',
    })
    const embed = buildStreamFailedEmbed(track.title, t)
    if (earlyReply) {
        await earlyReply.sent
        await replaceReplyWithError(interaction, embed)
        return
    }
    await interactionReply({ interaction, content: { embeds: [embed] } })
}
