import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createMusicApi } from './musicApi'

describe('createMusicApi', () => {
    const get = vi.fn()
    const post = vi.fn()
    const apiClient = { get, post }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('calls expected endpoints for commands', () => {
        const api = createMusicApi(apiClient as any)

        api.getState('g1')
        api.play('g1', 'query', 'vc1')
        api.pause('g1')
        api.resume('g1')
        api.skip('g1')
        api.stop('g1')
        api.volume('g1', 80)
        api.shuffle('g1')
        api.repeat('g1', 'autoplay')
        api.seek('g1', 12000)
        api.getQueue('g1')
        api.moveTrack('g1', 2, 1)
        api.removeTrack('g1', 0)
        api.clearQueue('g1')
        api.importPlaylist('g1', 'https://playlist', 'vc1')

        expect(get).toHaveBeenCalledWith('/guilds/g1/music/state')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/play', {
            query: 'query',
            voiceChannelId: 'vc1',
        })
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/pause')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/resume')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/skip')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/stop')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/volume', {
            volume: 80,
        })
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/shuffle')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/repeat', {
            mode: 'autoplay',
        })
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/seek', {
            position: 12000,
        })
        expect(get).toHaveBeenCalledWith('/guilds/g1/music/queue')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/queue/move', {
            from: 2,
            to: 1,
        })
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/queue/remove', {
            index: 0,
        })
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/queue/clear')
        expect(post).toHaveBeenCalledWith('/guilds/g1/music/import', {
            url: 'https://playlist',
            voiceChannelId: 'vc1',
        })
    })

    test('creates SSE connection with credentials', () => {
        const eventSourceMock = vi.fn()
        vi.stubGlobal('EventSource', eventSourceMock as any)

        const api = createMusicApi(apiClient as any)
        api.createSSEConnection('guild-99')

        expect(eventSourceMock).toHaveBeenCalledWith(
            '/api/guilds/guild-99/music/stream',
            { withCredentials: true },
        )
    })
})
