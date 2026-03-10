import { useCallback } from 'react'
import { api } from '@/services/api'
import type { QueueState } from '@/types'

type SendCommand = (
    action: () => Promise<unknown>,
    optimistic?: Partial<QueueState>,
) => Promise<void> | undefined

export function useMusicCommands(
    guildId: string | undefined,
    sendCommand: SendCommand,
    tracks: QueueState['tracks'],
) {
    const play = useCallback(
        (query: string, voiceChannelId?: string) => {
            if (!guildId) return
            return sendCommand(() =>
                api.music.play(guildId, query, voiceChannelId),
            )
        },
        [guildId, sendCommand],
    )

    const pause = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.pause(guildId), {
            isPlaying: false,
            isPaused: true,
        })
    }, [guildId, sendCommand])

    const resume = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.resume(guildId), {
            isPlaying: true,
            isPaused: false,
        })
    }, [guildId, sendCommand])

    const skip = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.skip(guildId))
    }, [guildId, sendCommand])

    const stop = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.stop(guildId), {
            isPlaying: false,
            isPaused: false,
            currentTrack: null,
            tracks: [],
        })
    }, [guildId, sendCommand])

    const setVolume = useCallback(
        (volume: number) => {
            if (!guildId) return
            return sendCommand(() => api.music.volume(guildId, volume), {
                volume,
            })
        },
        [guildId, sendCommand],
    )

    const shuffle = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.shuffle(guildId))
    }, [guildId, sendCommand])

    const setRepeatMode = useCallback(
        (mode: 'off' | 'track' | 'queue' | 'autoplay') => {
            if (!guildId) return
            return sendCommand(() => api.music.repeat(guildId, mode), {
                repeatMode: mode,
            })
        },
        [guildId, sendCommand],
    )

    const seek = useCallback(
        (position: number) => {
            if (!guildId) return
            return sendCommand(() => api.music.seek(guildId, position), {
                position,
            })
        },
        [guildId, sendCommand],
    )

    const removeTrack = useCallback(
        (index: number) => {
            if (!guildId) return
            return sendCommand(() => api.music.removeTrack(guildId, index), {
                tracks: tracks.filter((_, i) => i !== index),
            })
        },
        [guildId, sendCommand, tracks],
    )

    const moveTrack = useCallback(
        (from: number, to: number) => {
            if (!guildId) return
            return sendCommand(() => api.music.moveTrack(guildId, from, to))
        },
        [guildId, sendCommand],
    )

    const clearQueue = useCallback(() => {
        if (!guildId) return
        return sendCommand(() => api.music.clearQueue(guildId), { tracks: [] })
    }, [guildId, sendCommand])

    const importPlaylist = useCallback(
        (url: string, voiceChannelId?: string) => {
            if (!guildId) return
            return sendCommand(() =>
                api.music.importPlaylist(guildId, url, voiceChannelId),
            )
        },
        [guildId, sendCommand],
    )

    return {
        play,
        pause,
        resume,
        skip,
        stop,
        setVolume,
        shuffle,
        setRepeatMode,
        seek,
        removeTrack,
        moveTrack,
        clearQueue,
        importPlaylist,
    }
}
