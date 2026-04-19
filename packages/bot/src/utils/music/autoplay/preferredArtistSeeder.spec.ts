import {
    describe,
    it,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import type { GuildQueue, Track } from 'discord-player'
import type { User } from 'discord.js'
import { collectPreferredArtistCandidates } from './preferredArtistSeeder'
import * as lastFm from '../../../lastfm'

jest.mock('../../../lastfm')

describe('preferredArtistSeeder', () => {
    const getArtistTopTracksMock = jest.mocked(lastFm.getArtistTopTracks)

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should collect preferred artist candidates', async () => {
        const mockQueue = {
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Track 1',
                            author: 'Artist',
                            url: 'http://example.com/track1',
                            durationMS: 180000,
                        } as Track,
                    ],
                }),
            },
        } as unknown as GuildQueue

        const mockUser = { id: 'user-123' } as User

        getArtistTopTracksMock.mockResolvedValue([
            { artist: 'Test Artist', title: 'Top Track 1' },
        ])

        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue,
            mockUser,
            new Set(['Test Artist']),
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            { title: 'Current', author: 'Current Artist' } as Track,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBeGreaterThan(0)
        expect(getArtistTopTracksMock).toHaveBeenCalledWith('Test Artist', 6)
    })

    it('should handle empty preferred artists gracefully', async () => {
        const mockQueue = { player: {} } as unknown as GuildQueue
        const mockUser = { id: 'user-123' } as User
        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue,
            mockUser,
            new Set(),
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            { title: 'Current', author: 'Current Artist' } as Track,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBe(0)
        expect(getArtistTopTracksMock).not.toHaveBeenCalled()
    })

    it('should skip tracks longer than max duration', async () => {
        const mockQueue = {
            player: {
                search: jest.fn().mockResolvedValue({
                    tracks: [
                        {
                            title: 'Too Long Track',
                            author: 'Artist',
                            url: 'http://example.com/track',
                            durationMS: 15 * 60 * 1000,
                        } as Track,
                    ],
                }),
            },
        } as unknown as GuildQueue

        const mockUser = { id: 'user-123' } as User

        getArtistTopTracksMock.mockResolvedValue([
            { artist: 'Test Artist', title: 'Long Track' },
        ])

        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue,
            mockUser,
            new Set(['Test Artist']),
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            { title: 'Current', author: 'Current Artist' } as Track,
            new Set(),
            candidates,
        )

        expect(candidates.size).toBe(0)
    })
})
