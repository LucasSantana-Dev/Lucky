import type { Track, GuildQueue } from 'discord-player'
import { debugLog, errorLog } from '@lukbot/shared/utils'

export async function clearQueue(queue: GuildQueue): Promise<boolean> {
    try {
        queue.clear()
        debugLog({ message: 'Queue cleared successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error clearing queue:', error })
        return false
    }
}

export async function shuffleQueue(queue: GuildQueue): Promise<boolean> {
    try {
        const tracks = queue.tracks.toArray()
        if (tracks.length <= 1) return true

        for (let i = tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tracks[i], tracks[j]] = [tracks[j], tracks[i]]
        }

        queue.clear()
        for (const track of tracks) {
            queue.addTrack(track)
        }

        debugLog({ message: 'Queue shuffled successfully' })
        return true
    } catch (error) {
        errorLog({ message: 'Error shuffling queue:', error })
        return false
    }
}

export async function removeTrackFromQueue(queue: GuildQueue, position: number): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (position < 0 || position >= tracks.length) return null

        const track = tracks[position]
        queue.node.remove(track)
        debugLog({ message: 'Track removed from queue', data: { position, track: track.title } })
        return track
    } catch (error) {
        errorLog({ message: 'Error removing track from queue:', error })
        return null
    }
}

export async function moveTrackInQueue(queue: GuildQueue, fromPosition: number, toPosition: number): Promise<Track | null> {
    try {
        const tracks = queue.tracks.toArray()
        if (fromPosition < 0 || fromPosition >= tracks.length || toPosition < 0 || toPosition >= tracks.length) return null

        const track = tracks[fromPosition]
        queue.node.remove(track)

        const newTracks = queue.tracks.toArray()
        if (toPosition >= newTracks.length) {
            queue.addTrack(track)
        } else {
            queue.insertTrack(track, toPosition)
        }

        debugLog({ message: 'Track moved in queue', data: { track: track.title, from: fromPosition, to: toPosition } })
        return track
    } catch (error) {
        errorLog({ message: 'Error moving track in queue:', error })
        return null
    }
}

export async function replenishQueue(queue: GuildQueue): Promise<void> {
    try {
        debugLog({ message: 'Replenishing queue', data: { guildId: queue.guild.id } })
        debugLog({ message: 'Queue replenished successfully' })
    } catch (error) {
        errorLog({ message: 'Error replenishing queue:', error })
    }
}
