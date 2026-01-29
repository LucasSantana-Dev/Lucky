/**
 * Queue management utilities
 */

import type { Track } from 'discord-player'
import type { PlayCommandOptions } from './types'
import { debugLog, errorLog } from '@lukbot/shared/utils'

export async function manageQueue(
    options: PlayCommandOptions,
    tracks: Track[],
    isPlaylist = false,
): Promise<void> {
    try {
        debugLog({
            message: `Managing queue for ${tracks.length} tracks`,
            data: { guildId: options.guildId, isPlaylist },
        })

        const { queue } = options

        if (!queue) {
            throw new Error('Queue not found')
        }

        const wasEmpty = queue.tracks.size === 0

        for (const track of tracks) {
            track.requestedBy = options.user.user
            queue.addTrack(track)
        }

        if (wasEmpty && !queue.node.isPlaying()) {
            await queue.node.play()
        }

        debugLog({
            message: `Successfully added ${tracks.length} tracks to queue`,
            data: { guildId: options.guildId, isPlaylist, wasEmpty },
        })
    } catch (error) {
        errorLog({
            message: 'Error managing queue:',
            error,
            data: { guildId: options.guildId },
        })
        throw error
    }
}
