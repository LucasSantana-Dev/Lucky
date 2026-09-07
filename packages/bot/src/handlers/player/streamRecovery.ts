import { QueryType, type GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { debugLog, warnLog } from '@lucky/shared/utils'
import {
    analyzeYouTubeError,
    logYouTubeError,
} from '../../utils/music/youtubeErrorHandler'
import { youtubeConfig } from '@lucky/shared/config'
import {
    providerFromTrack,
    providerHealthService,
} from '../../utils/music/search/providerHealth'
import type { QueueMetadata } from '../../types/QueueMetadata'
import { isSameTrack } from './errorClassification'
import { notifyChannelStreamFailed } from './streamFailureNotifier'

function describeYouTubeParserErrorType(
    youtubeErrorInfo: ReturnType<typeof analyzeYouTubeError>,
): string {
    if (youtubeErrorInfo.isCompositeVideoError)
        return 'CompositeVideoPrimaryInfo'
    if (youtubeErrorInfo.isHypePointsError) return 'HypePointsFactoid'
    if (youtubeErrorInfo.isTypeMismatchError) return 'TypeMismatch'
    return 'Parser'
}

export function handleYouTubeParserError(
    queue: GuildQueue,
    error: Error,
    youtubeErrorInfo: ReturnType<typeof analyzeYouTubeError>,
): void {
    const requestedBy: User | undefined =
        queue.currentTrack?.requestedBy ??
        (queue.metadata as QueueMetadata | undefined)?.requestedBy ??
        undefined
    logYouTubeError(
        error,
        `player error in ${queue.guild.name}`,
        requestedBy?.id ?? 'unknown',
    )

    debugLog({
        message: 'YouTube parser error detected, skipping current track',
        data: {
            errorType: describeYouTubeParserErrorType(youtubeErrorInfo),
        },
    })

    if (
        (youtubeConfig as { errorHandling: { skipOnParserError: boolean } })
            .errorHandling.skipOnParserError
    ) {
        queue.node.skip()
    }
}

export async function recoverFromStreamExtractionError(
    queue: GuildQueue,
    currentTrack: NonNullable<GuildQueue['currentTrack']>,
): Promise<void> {
    debugLog({
        message: `Problematic URL: ${currentTrack.url}`,
    })

    const requestedByUser: User | undefined =
        currentTrack.requestedBy ??
        (queue.metadata as QueueMetadata | undefined)?.requestedBy ??
        undefined
    if (!requestedByUser) {
        warnLog({
            message: 'Stream failed, skipping — no requestedBy to search with',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
        return
    }

    if (!currentTrack.title) {
        warnLog({
            message: 'Stream failed, track has no title — skipping recovery',
            data: { guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
        return
    }

    // Timeout guard: if YouTube search hangs (no response in 10s), skip the
    // track rather than blocking the player indefinitely.
    const searchTimeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 10_000).unref(),
    )
    const searchResult = await Promise.race([
        queue.player.search(currentTrack.title, {
            requestedBy: requestedByUser,
            searchEngine: QueryType.YOUTUBE_SEARCH,
        }),
        searchTimeout,
    ])

    if (!searchResult || searchResult.tracks.length === 0) {
        warnLog({
            message: 'Stream failed, YouTube recovery found nothing — skipping',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
        return
    }

    const alternativeTrack = searchResult.tracks.find(
        (track) => !isSameTrack(currentTrack, track),
    )

    if (alternativeTrack) {
        queue.insertTrack(alternativeTrack, 0)
        queue.node.skip()
        providerHealthService.recordSuccess(providerFromTrack(currentTrack))
        debugLog({
            message: 'Successfully recovered from stream extraction error',
            data: {
                title: currentTrack.title,
                alternativeUrl: alternativeTrack.url,
            },
        })
    } else {
        const allSameTrack = searchResult.tracks.some((track) =>
            isSameTrack(currentTrack, track),
        )
        warnLog({
            message: allSameTrack
                ? 'Stream failed, YouTube returned same track alternative — skipping instead of reinsert'
                : 'Stream failed, all YouTube alternatives already in queue — skipping',
            data: { title: currentTrack.title, guildId: queue.guild.id },
        })
        await notifyChannelStreamFailed(queue, currentTrack.title)
        queue.node.skip()
    }
}
