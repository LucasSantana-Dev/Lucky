import type { Track, GuildQueue } from 'discord-player'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import { isSimilarTitle } from '../../../../utils/music/titleComparison'
import type { CustomClient } from '../../../../types'
import type { FormattedQueueData } from './queueFormatter'

export function groupQueueTracks(
    queue: GuildQueue | null,
    client: CustomClient,
): FormattedQueueData {
    const tracks: Track[] = []
    const manualTracks: Track[] = []
    const autoplayTracks: Track[] = []

    if (queue?.tracks) {
        try {
            const trackArray = queue.tracks.toArray()
            debugLog({
                message: 'Track array length',
                data: { length: trackArray.length },
            })

            for (const track of trackArray) {
                try {
                    if (!track) {
                        debugLog({ message: 'Skipping null track' })
                        continue
                    }

                    if (!track.title) {
                        debugLog({
                            message: 'Track missing title',
                            data: { trackId: track.id },
                        })
                        continue
                    }

                    const isDuplicate = tracks.some((existingTrack) =>
                        isSimilarTitle(track.title, existingTrack.title),
                    )

                    if (isDuplicate) {
                        debugLog({
                            message: 'Skipping duplicate track',
                            data: {
                                trackTitle: track.title,
                                existingTracks: tracks.map((t) => t.title),
                            },
                        })
                        continue
                    }

                    if (track.requestedBy?.id === client.user?.id) {
                        autoplayTracks.push(track)
                    } else {
                        manualTracks.push(track)
                    }
                    tracks.push(track)
                } catch (trackError) {
                    errorLog({
                        message: 'Error processing individual track:',
                        error: trackError,
                    })
                    continue
                }
            }
        } catch (arrayError) {
            errorLog({
                message: 'Error converting tracks to array:',
                error: arrayError,
            })
        }
    }

    debugLog({
        message: 'Queue tracks processed',
        data: {
            total: tracks.length,
            manual: manualTracks.length,
            autoplay: autoplayTracks.length,
        },
    })

    return {
        manualTracks,
        autoplayTracks,
        totalTracks: tracks.length,
    }
}
