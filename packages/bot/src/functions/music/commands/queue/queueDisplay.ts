import type { Track } from 'discord-player'
import type { TFunction } from 'i18next'
import { getTrackInfo } from '../../../../services/musicManagement/trackUtils'
import { isSimilarTitle } from '../../../../services/musicManagement/titleComparison'
import type { TrackDisplayInfo, QueueDisplayOptions } from './types'
import { escapeTrackText } from '../../../../utils/music/nowPlayingEmbed'

export async function formatTrackForDisplay(
    track: Track,
    position: number,
    _options: QueueDisplayOptions,
): Promise<TrackDisplayInfo> {
    const trackInfo = await getTrackInfo(track)
    const metadata = (track.metadata ?? {}) as {
        isAutoplay?: boolean
        recommendationReason?: string
    }

    return {
        title: track.title,
        author: track.author,
        url: track.url,
        duration: trackInfo.duration || '',
        thumbnail: track.thumbnail,
        requestedBy: track.requestedBy?.username,
        position,
        isAutoplay: metadata.isAutoplay,
        recommendationReason: metadata.recommendationReason,
    }
}

function isAutoplayTrack(track: Track): boolean {
    const meta = (track.metadata ?? {}) as { isAutoplay?: boolean }
    return meta.isAutoplay === true
}

/** "1. Title · Artist · 6:44 · requester" (or "autoplay" for a pick). */
function formatSingleTrack(
    info: TrackDisplayInfo,
    index: number,
    t: TFunction,
): string {
    const title =
        info.title.length > 40 ? info.title.slice(0, 39) + '\u2026' : info.title
    const name = escapeTrackText(title)
    const link =
        info.url && info.url.startsWith('http')
            ? `[${name}](${info.url})`
            : name
    const who = info.isAutoplay
        ? t('music.queue.autoplayTag')
        : info.requestedBy
    return [
        `${index + 1}. ${link}`,
        escapeTrackText(info.author),
        info.duration,
        who,
    ]
        .filter(Boolean)
        .join(' · ')
}

export async function createTrackListDisplay(
    tracks: Track[],
    options: QueueDisplayOptions,
    page: number,
    t: TFunction,
): Promise<string> {
    const perPage = options.maxTracksToShow
    const start = page * perPage
    const pageTracks = tracks.slice(start, start + perPage)

    const userTracks = pageTracks.filter((t) => !isAutoplayTrack(t))
    const autoTracks = pageTracks.filter((t) => isAutoplayTrack(t))

    const renderSection = async (bucket: Track[]): Promise<string> => {
        const lines: string[] = []
        for (const track of bucket) {
            const idx = tracks.indexOf(track)
            const info = await formatTrackForDisplay(track, idx, options)
            lines.push(formatSingleTrack(info, idx, t))
        }
        return lines.join('\n')
    }

    const sections: string[] = []

    if (userTracks.length > 0) {
        sections.push(await renderSection(userTracks))
    }

    if (autoTracks.length > 0) {
        if (userTracks.length > 0) {
            sections.push(`**${t('music.queue.autoplaySection')}**`)
        }
        sections.push(await renderSection(autoTracks))
    }

    let result = sections.join('\n')

    if (tracks.length > start + perPage) {
        const remaining = tracks.length - (start + perPage)
        result += `\n${t('music.queue.more', { count: remaining })}`
    }

    // Empty, not an English sentinel: the only caller has a localized
    // fallback, and a truthy sentinel here would always win over it.
    return result
}

export async function findSimilarTracksInQueue(
    currentTrack: Track,
    upcomingTracks: Track[],
): Promise<Track[]> {
    const similarTracks: Track[] = []

    for (const track of upcomingTracks) {
        if (await isSimilarTitle(currentTrack.title, track.title)) {
            similarTracks.push(track)
        }
    }

    return similarTracks
}
