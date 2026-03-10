import type { AxiosInstance } from 'axios'
import type { QueueState, MusicCommandResult } from '@/types'

export function createMusicApi(apiClient: AxiosInstance) {
    return {
        getState: (guildId: string) =>
            apiClient.get<QueueState>(`/guilds/${guildId}/music/state`),
        play: (guildId: string, query: string, voiceChannelId?: string) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/play`,
                { query, voiceChannelId },
            ),
        pause: (guildId: string) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/pause`,
            ),
        resume: (guildId: string) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/resume`,
            ),
        skip: (guildId: string) =>
            apiClient.post<MusicCommandResult>(`/guilds/${guildId}/music/skip`),
        stop: (guildId: string) =>
            apiClient.post<MusicCommandResult>(`/guilds/${guildId}/music/stop`),
        volume: (guildId: string, volume: number) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/volume`,
                { volume },
            ),
        shuffle: (guildId: string) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/shuffle`,
            ),
        repeat: (
            guildId: string,
            mode: 'off' | 'track' | 'queue' | 'autoplay',
        ) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/repeat`,
                { mode },
            ),
        seek: (guildId: string, position: number) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/seek`,
                { position },
            ),
        getQueue: (guildId: string) =>
            apiClient.get<{
                currentTrack: QueueState['currentTrack']
                tracks: QueueState['tracks']
                total: number
            }>(`/guilds/${guildId}/music/queue`),
        moveTrack: (guildId: string, from: number, to: number) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/queue/move`,
                { from, to },
            ),
        removeTrack: (guildId: string, index: number) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/queue/remove`,
                { index },
            ),
        clearQueue: (guildId: string) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/queue/clear`,
            ),
        importPlaylist: (
            guildId: string,
            url: string,
            voiceChannelId?: string,
        ) =>
            apiClient.post<MusicCommandResult>(
                `/guilds/${guildId}/music/import`,
                { url, voiceChannelId },
            ),
        createSSEConnection: (guildId: string): EventSource => {
            return new EventSource(`/api/guilds/${guildId}/music/stream`, {
                withCredentials: true,
            })
        },
    }
}
