import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { QueryType } from 'discord-player'
import type { Track, GuildQueue } from 'discord-player'
import type { User } from 'discord.js'
import { collectPreferredArtistCandidates } from './preferredArtistSeeder'
import * as lastfm from '../../../lastfm'

jest.mock('../../../lastfm')

describe('preferredArtistSeeder', () => {
    let mockQueue: Partial<GuildQueue>
    let mockUser: Partial<User>
    let mockCurrentTrack: Partial<Track>

    beforeEach(() => {
        jest.clearAllMocks()

        mockCurrentTrack = {
            title: 'Current Song',
            author: 'Current Artist',
            url: 'https://example.com/current',
        }

        mockUser = {
            id: 'test-user-id',
        }

        mockQueue = {
            player: {
                search: jest.fn(),
            } as any,
        }
    })

    it('returns early when preferredArtistNames is empty', async () => {
        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue as GuildQueue,
            mockUser as User,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack as Track,
            new Set(),
            candidates,
            'similar',
            new Map(),
            new Set(),
            new Set(),
            null,
            [],
        )

        expect(candidates.size).toBe(0)
        expect(jest.mocked(lastfm.getArtistTopTracks)).not.toHaveBeenCalled()
    })

    it('fetches top tracks for preferred artists', async () => {
        jest.mocked(lastfm.getArtistTopTracks).mockResolvedValue([
            { artist: 'Artist A', title: 'Track 1' },
            { artist: 'Artist A', title: 'Track 2' },
        ])

        jest.mocked(mockQueue.player!.search as any).mockResolvedValue({
            tracks: [
                {
                    title: 'Track 1',
                    author: 'Artist A',
                    url: 'https://example.com/track1',
                    durationMS: 180000,
                } as Track,
            ],
        })

        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue as GuildQueue,
            mockUser as User,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack as Track,
            new Set(),
            candidates,
            'similar',
            new Map(),
            new Set(),
            new Set(),
            null,
            ['Artist A'],
        )

        expect(jest.mocked(lastfm.getArtistTopTracks)).toHaveBeenCalledWith('Artist A', 6)
    })

    it('skips blocked artists', async () => {
        const blockedArtistKeys = new Set(['artistbkey'])
        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue as GuildQueue,
            mockUser as User,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            blockedArtistKeys,
            mockCurrentTrack as Track,
            new Set(),
            candidates,
            'similar',
            new Map(),
            new Set(),
            new Set(),
            null,
            ['Artist B'],
        )

        expect(jest.mocked(lastfm.getArtistTopTracks)).not.toHaveBeenCalled()
    })

    it('adds candidates with preferred artist reason', async () => {
        jest.mocked(lastfm.getArtistTopTracks).mockResolvedValue([
            { artist: 'Test Artist', title: 'Test Track' },
        ])

        jest.mocked(mockQueue.player!.search as any).mockResolvedValue({
            tracks: [
                {
                    title: 'Test Track',
                    author: 'Test Artist',
                    url: 'https://example.com/test',
                    durationMS: 180000,
                } as Track,
            ],
        })

        const candidates = new Map()

        await collectPreferredArtistCandidates(
            mockQueue as GuildQueue,
            mockUser as User,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            mockCurrentTrack as Track,
            new Set(),
            candidates,
            'similar',
            new Map(),
            new Set(),
            new Set(),
            null,
            ['Test Artist'],
        )

        expect(candidates.size).toBeGreaterThan(0)
        const candidate = Array.from(candidates.values())[0]
        expect(candidate?.reason).toContain('preferred artist')
    })
})
