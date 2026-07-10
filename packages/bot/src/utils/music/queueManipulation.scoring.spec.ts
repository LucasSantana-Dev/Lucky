import { jest } from '@jest/globals'

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: jest.fn(),
        addTrackToHistory: jest.fn().mockResolvedValue(true),
        getReplayFrequentTracks: jest.fn(),
    },
    guildSettingsService: {
        getGuildSettings: jest.fn(),
    },
    lastFmLinkService: {
        getByDiscordId: jest.fn(),
    },
    spotifyLinkService: {
        getValidAccessToken: jest.fn().mockResolvedValue(null),
        getByDiscordId: jest.fn().mockResolvedValue(null),
    },
    premiumService: {
        isPremium: jest.fn(() => Promise.resolve(false)),
    },
}))

jest.mock('../../spotify/spotifyApi', () => ({
    getAudioFeatures: jest.fn().mockResolvedValue(null),
    searchSpotifyTrack: jest.fn().mockResolvedValue(null),
    getBatchAudioFeatures: jest.fn().mockResolvedValue(new Map()),
    getArtistPopularity: jest.fn().mockResolvedValue(null),
    getArtistGenres: jest.fn().mockResolvedValue([]),
    getSpotifyRecommendations: jest.fn().mockResolvedValue([]),
}))

import {
    enrichWithAudioFeatures,
    getGenreFamilies,
    calculateGenreFamilyPenalty,
} from './queueManipulation'

describe('getGenreFamilies', () => {
    it('identifies single genre family', () => {
        const families = getGenreFamilies(['hip hop'])
        expect(families.has('rap_hiphop')).toBe(true)
    })

    it('identifies multiple families', () => {
        expect(getGenreFamilies(['hip hop', 'rock', 'soul']).size).toBe(3)
    })

    it('handles empty array', () => {
        expect(getGenreFamilies([]).size).toBe(0)
    })

    it('is case insensitive', () => {
        const a = getGenreFamilies(['hip hop'])
        const b = getGenreFamilies(['HIP HOP'])
        expect(Array.from(a).sort()).toEqual(Array.from(b).sort())
    })

    it('matches all 10 families', () => {
        const genres = [
            'hip hop',
            'soul',
            'edm',
            'rock',
            'pop',
            'reggaeton',
            'country',
            'jazz',
            'afrobeat',
            'lofi',
        ]
        expect(getGenreFamilies(genres).size).toBe(10)
    })

    it('handles unknown genres', () => {
        expect(getGenreFamilies(['unknown xyz']).size).toBe(0)
    })
})

describe('calculateGenreFamilyPenalty', () => {
    it('returns 0 when families match', () => {
        expect(calculateGenreFamilyPenalty(['rock'], ['metal'])).toBe(0)
    })

    it('returns -0.1 for empty current genres', () => {
        expect(calculateGenreFamilyPenalty([], ['hip hop'])).toBe(-0.1)
    })

    it('returns -0.1 for empty candidate genres', () => {
        expect(calculateGenreFamilyPenalty(['rock'], [])).toBe(-0.1)
    })

    it('applies -0.6 for strong genre mismatch', () => {
        expect(calculateGenreFamilyPenalty(['rap'], ['rock'])).toBe(-0.6)
    })

    it('applies -0.3 for weak genre mismatch', () => {
        expect(calculateGenreFamilyPenalty(['pop'], ['rock'])).toBe(-0.3)
    })

    it('treats rap_hiphop as strong', () => {
        expect(calculateGenreFamilyPenalty(['hip hop'], ['pop'])).toBe(-0.6)
    })

    it('treats rock_metal as strong', () => {
        expect(calculateGenreFamilyPenalty(['metal'], ['pop'])).toBe(-0.6)
    })

    it('treats latin as strong', () => {
        expect(calculateGenreFamilyPenalty(['reggaeton'], ['pop'])).toBe(-0.6)
    })
})

describe('enrichWithAudioFeatures', () => {
    it('returns unchanged when features null', async () => {
        const tracks = [
            {
                track: {
                    title: 'T',
                    author: 'A',
                    url: 'https://spotify.com',
                },
                score: 1,
                basis: { source: 'spotify-rec' as const, signals: [] },
            },
        ]
        const result = await enrichWithAudioFeatures(tracks, 'u1', null)
        expect(result).toEqual(tracks)
    })

    it('returns unchanged when userId empty', async () => {
        const tracks = [
            {
                track: {
                    title: 'T',
                    author: 'A',
                    url: 'https://spotify.com',
                },
                score: 1,
                basis: { source: 'spotify-rec' as const, signals: [] },
            },
        ]
        const result = await enrichWithAudioFeatures(tracks, '', {
            energy: 0.7,
            valence: 0.6,
        } as any)
        expect(result).toEqual(tracks)
    })

    it('returns unchanged when no Spotify links', async () => {
        const tracks = [
            {
                track: {
                    title: 'T',
                    author: 'A',
                    url: 'https://youtube.com',
                },
                score: 1,
                basis: { source: 'spotify-rec' as const, signals: [] },
            },
        ]
        const result = await enrichWithAudioFeatures(tracks, 'u1', {
            energy: 0.7,
            valence: 0.6,
        } as any)
        expect(result).toEqual(tracks)
    })
})
