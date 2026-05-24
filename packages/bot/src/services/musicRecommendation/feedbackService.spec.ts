import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { getPrismaClient } from '@lucky/shared/utils'
import { RecommendationFeedbackService } from './feedbackService'

const getMock = jest.fn()
const setexMock = jest.fn()
const delMock = jest.fn()

const mockUserArtistPreference = {
    findMany: jest.fn(),
}

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    getPrismaClient: jest.fn(() => ({
        userArtistPreference: mockUserArtistPreference,
    })),
}))

jest.mock('@lucky/shared/services', () => ({
    redisClient: {
        get: (...args: unknown[]) => getMock(...args),
        setex: (...args: unknown[]) => setexMock(...args),
        del: (...args: unknown[]) => delMock(...args),
    },
}))

describe('RecommendationFeedbackService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it.each([
        { feedback: 'dislike' as const, getter: 'getDislikedTrackKeys' },
        { feedback: 'like' as const, getter: 'getLikedTrackKeys' },
    ])(
        'stores $feedback feedback and returns keys',
        async ({ feedback, getter }) => {
            const now = 10_000
            const service = new RecommendationFeedbackService(30)
            const key = service.buildTrackKey('Song', 'Artist')

            getMock.mockResolvedValueOnce(null)
            setexMock.mockResolvedValueOnce(true)
            getMock.mockResolvedValueOnce(
                JSON.stringify({
                    [key]: {
                        feedback,
                        updatedAt: now,
                        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
                    },
                }),
            )

            await service.setFeedback('guild-1', 'user-1', key, feedback, now)
            const keys = await (service[getter as keyof typeof service] as any)(
                'guild-1',
                'user-1',
                now + 100,
            )

            expect(keys.has(key)).toBe(true)
            expect(setexMock).toHaveBeenCalled()
        },
    )

    it('getFeedbackCounts returns correct liked/disliked counts', async () => {
        const now = 10_000
        const service = new RecommendationFeedbackService(30)
        const keyA = service.buildTrackKey('Song A', 'Artist A')
        const keyB = service.buildTrackKey('Song B', 'Artist B')
        const keyC = service.buildTrackKey('Song C', 'Artist C')

        getMock.mockResolvedValue(
            JSON.stringify({
                [keyA]: {
                    feedback: 'like',
                    updatedAt: now,
                    expiresAt: now + 1_000_000,
                },
                [keyB]: {
                    feedback: 'dislike',
                    updatedAt: now,
                    expiresAt: now + 1_000_000,
                },
                [keyC]: {
                    feedback: 'like',
                    updatedAt: now,
                    expiresAt: now + 1_000_000,
                },
            }),
        )

        const counts = await service.getFeedbackCounts('user-1', now)

        expect(counts.liked).toBe(2)
        expect(counts.disliked).toBe(1)
    })

    it('cleans expired feedback entries', async () => {
        const now = 50_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song B', 'Artist B')

        getMock.mockResolvedValue(
            JSON.stringify({
                [key]: {
                    feedback: 'dislike',
                    updatedAt: now - 10_000,
                    expiresAt: now - 1,
                },
            }),
        )
        setexMock.mockResolvedValue(true)

        const disliked = await service.getDislikedTrackKeys(
            'guild-2',
            'user-2',
            now,
        )

        expect(disliked.size).toBe(0)
        expect(setexMock).toHaveBeenCalled()
    })

    it.each([
        { getter: 'getDislikedTrackKeys' },
        { getter: 'getLikedTrackKeys' },
    ])('$getter returns empty set for undefined userId', async ({ getter }) => {
        const service = new RecommendationFeedbackService(30)

        const result = await (service[getter as keyof typeof service] as any)(
            'guild-1',
            undefined,
        )
        expect(result.size).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })

    it.each([
        {
            feedback: 'prefer' as const,
            getter: 'getPreferredArtistKeys',
            tested: 'preferred',
        },
        {
            feedback: 'block' as const,
            getter: 'getBlockedArtistKeys',
            tested: 'blocked',
        },
    ])(
        '$getter returns $tested artists',
        async ({ feedback, getter, tested }) => {
            const service = new RecommendationFeedbackService(30)
            const artistKey1 = `artist1_${feedback}`
            const artistKey2 = `artist2_${feedback}`
            const otherType = feedback === 'prefer' ? 'block' : 'prefer'

            getMock.mockResolvedValue(
                JSON.stringify({
                    [artistKey1]: feedback,
                    [artistKey2]: feedback,
                    [otherType]: otherType,
                }),
            )

            const result = await (
                service[getter as keyof typeof service] as any
            )('guild-1', 'user-1')

            expect(result.has(artistKey1)).toBe(true)
            expect(result.has(artistKey2)).toBe(true)
            expect(result.has(otherType)).toBe(false)
            expect(result.size).toBe(2)
        },
    )

    it.each([
        { getter: 'getPreferredArtistKeys' },
        { getter: 'getBlockedArtistKeys' },
    ])('$getter returns empty set for undefined userId', async ({ getter }) => {
        const service = new RecommendationFeedbackService(30)

        const result = await (service[getter as keyof typeof service] as any)(
            'guild-1',
            undefined,
        )

        expect(result.size).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('removeArtistFeedback deletes artist preference', async () => {
        const service = new RecommendationFeedbackService(30)
        getMock.mockResolvedValue(
            JSON.stringify({
                taylorswift: 'prefer',
                arianagrande: 'prefer',
            }),
        )
        setexMock.mockResolvedValue(true)

        await service.removeArtistFeedback('guild-1', 'user-1', 'Taylor Swift')

        expect(setexMock).toHaveBeenCalled()
        const callArgs = setexMock.mock.calls[0]
        const storedData = JSON.parse(callArgs[2] as string)
        expect(storedData).not.toHaveProperty('taylorswift')
        expect(storedData).toHaveProperty('arianagrande')
    })

    it('getArtistFeedbackSummary returns preferred and blocked lists', async () => {
        const service = new RecommendationFeedbackService(30)
        getMock.mockResolvedValue(
            JSON.stringify({
                artistone: 'prefer',
                artisttwo: 'prefer',
                badartist: 'block',
            }),
        )

        const summary = await service.getArtistFeedbackSummary('user-1')

        expect(summary.preferred).toContain('artistone')
        expect(summary.preferred).toContain('artisttwo')
        expect(summary.blocked).toContain('badartist')
        expect(summary.preferred.length).toBe(2)
        expect(summary.blocked.length).toBe(1)
    })

    it('getArtistFeedbackSummary returns empty lists for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)

        const summary = await service.getArtistFeedbackSummary(undefined)

        expect(summary.preferred).toEqual([])
        expect(summary.blocked).toEqual([])
        expect(getMock).not.toHaveBeenCalled()
    })

    it.each([
        { feedback: 'like' as const, getter: 'getLikedTrackWeights' },
        { feedback: 'dislike' as const, getter: 'getDislikedTrackWeights' },
    ])(
        '$getter returns weighted map with decay',
        async ({ feedback, getter }) => {
            const service = new RecommendationFeedbackService(30)
            const key = service.buildTrackKey('Song', 'Artist')
            const now = Date.now()
            const updatedAt = now - 24 * 60 * 60 * 1000

            getMock.mockResolvedValue(
                JSON.stringify({
                    [key]: {
                        feedback,
                        updatedAt,
                        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
                    },
                }),
            )

            const weights = await (
                service[getter as keyof typeof service] as any
            )('user-1', now)

            expect(weights.has(key)).toBe(true)
            const weight = weights.get(key)
            expect(weight).toBeGreaterThan(0.95)
            expect(weight).toBeLessThanOrEqual(1.0)
        },
    )

    it.each([
        { getter: 'getLikedTrackWeights' },
        { getter: 'getDislikedTrackWeights' },
    ])('$getter returns empty map for empty userId', async ({ getter }) => {
        const service = new RecommendationFeedbackService(30)

        const weights = await (service[getter as keyof typeof service] as any)(
            '',
        )

        expect(weights.size).toBe(0)
        expect(getMock).not.toHaveBeenCalled()
    })

    it('getLikedTrackWeights prunes expired entries and saves', async () => {
        const now = 50_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song D', 'Artist D')

        getMock.mockResolvedValue(
            JSON.stringify({
                [key]: {
                    feedback: 'like',
                    updatedAt: now - 10_000,
                    expiresAt: now - 1,
                },
            }),
        )
        setexMock.mockResolvedValue(true)

        const weights = await service.getLikedTrackWeights('user-1', now)

        expect(weights.size).toBe(0)
        expect(setexMock).toHaveBeenCalled()
    })

    it('decay weight reduces to 0.15 after 30 days', async () => {
        const baseTime = 100_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song C', 'Artist C')
        const thirtyDaysAgo = baseTime - 30 * 24 * 60 * 60 * 1000

        getMock.mockResolvedValue(
            JSON.stringify({
                [key]: {
                    feedback: 'like',
                    updatedAt: thirtyDaysAgo,
                    expiresAt: baseTime + 1_000_000,
                },
            }),
        )

        const weights = await service.getLikedTrackWeights('user-1', baseTime)

        const weight = weights.get(key)
        expect(weight).toBeCloseTo(0.15, 1)
    })
})

describe('implicit feedback', () => {
    beforeEach(() => {
        getMock.mockReset()
        setexMock.mockReset()
    })

    it('recordImplicitFeedback trims to 200 entries when exceeded', async () => {
        const bigMap: Record<string, { type: string; updatedAt: number }> = {}
        for (let i = 0; i < 201; i++) {
            bigMap[`track${i}::artist`] = {
                type: 'implicit_like',
                updatedAt: i,
            }
        }
        getMock.mockResolvedValue(JSON.stringify(bigMap))
        setexMock.mockResolvedValue('OK')
        const service = new RecommendationFeedbackService(30)

        await service.recordImplicitFeedback(
            'user-1',
            'newtrack::artist',
            'implicit_dislike',
        )

        const saved = JSON.parse(setexMock.mock.calls[0][2] as string)
        expect(Object.keys(saved).length).toBeLessThanOrEqual(200)
    })

    it.each([
        {
            type: 'implicit_dislike' as const,
            getter: 'getImplicitDislikeKeys',
            included: 'song1::artist',
            excluded: 'song2::artist',
        },
        {
            type: 'implicit_like' as const,
            getter: 'getImplicitLikeKeys',
            included: 'song2::artist',
            excluded: 'song1::artist',
        },
    ])(
        '$getter returns $type entries',
        async ({ type, getter, included, excluded }) => {
            getMock.mockResolvedValue(
                JSON.stringify({
                    'song1::artist': {
                        type: 'implicit_dislike',
                        updatedAt: Date.now(),
                    },
                    'song2::artist': {
                        type: 'implicit_like',
                        updatedAt: Date.now(),
                    },
                }),
            )
            const service = new RecommendationFeedbackService(30)

            const keys = await (service[getter as keyof typeof service] as any)(
                'user-1',
            )

            expect(keys.has(included)).toBe(true)
            expect(keys.has(excluded)).toBe(false)
        },
    )

    it.each([
        { getter: 'getImplicitDislikeKeys' },
        { getter: 'getImplicitLikeKeys' },
    ])('$getter returns empty set on redis error', async ({ getter }) => {
        getMock.mockRejectedValue(new Error('redis down'))
        const service = new RecommendationFeedbackService(30)

        const keys = await (service[getter as keyof typeof service] as any)(
            'user-1',
        )

        expect(keys.size).toBe(0)
    })

    it('recordImplicitFeedback handles redis error gracefully', async () => {
        getMock.mockRejectedValue(new Error('redis down'))
        const service = new RecommendationFeedbackService(30)

        await expect(
            service.recordImplicitFeedback('user-1', 'key', 'implicit_like'),
        ).resolves.toBeUndefined()
    })

    it.each([
        { getter: 'getLikedTrackWeights' },
        { getter: 'getDislikedTrackWeights' },
    ])(
        '$getter returns empty map when no feedback data',
        async ({ getter }) => {
            getMock.mockResolvedValue(null)
            const service = new RecommendationFeedbackService(30)

            const weights = await (
                service[getter as keyof typeof service] as any
            )('user-1')

            expect(weights.size).toBe(0)
        },
    )

    describe('Postgres DB integration', () => {
        beforeEach(() => {
            ;(getPrismaClient as jest.Mock).mockReturnValue({
                userArtistPreference: mockUserArtistPreference,
            })
            mockUserArtistPreference.findMany.mockResolvedValue([])
        })

        it('getPreferredArtistKeys merges Redis and Postgres results', async () => {
            const service = new RecommendationFeedbackService(30)
            getMock.mockResolvedValue(JSON.stringify({ redisartist: 'prefer' }))
            mockUserArtistPreference.findMany.mockResolvedValue([
                { artistKey: 'dbartist' },
            ])

            const result = await service.getPreferredArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.has('redisartist')).toBe(true)
            expect(result.has('dbartist')).toBe(true)
            expect(result.size).toBe(2)
        })

        it('getBlockedArtistKeys merges Redis and Postgres results', async () => {
            const service = new RecommendationFeedbackService(30)
            getMock.mockResolvedValue(JSON.stringify({ redisblocked: 'block' }))
            mockUserArtistPreference.findMany.mockResolvedValue([
                { artistKey: 'dbblocked' },
            ])

            const result = await service.getBlockedArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.has('redisblocked')).toBe(true)
            expect(result.has('dbblocked')).toBe(true)
            expect(result.size).toBe(2)
        })

        it('getPreferredArtistKeys deduplicates keys present in both Redis and DB', async () => {
            const service = new RecommendationFeedbackService(30)
            getMock.mockResolvedValue(
                JSON.stringify({ sharedartist: 'prefer' }),
            )
            mockUserArtistPreference.findMany.mockResolvedValue([
                { artistKey: 'sharedartist' },
            ])

            const result = await service.getPreferredArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.size).toBe(1)
        })

        it.each([
            {
                feedback: 'prefer' as const,
                getter: 'getPreferredArtistKeys',
                redisKey: 'redisartist',
            },
            {
                feedback: 'block' as const,
                getter: 'getBlockedArtistKeys',
                redisKey: 'redisblocked',
            },
        ])(
            '$getter handles Postgres errors gracefully',
            async ({ feedback, getter, redisKey }) => {
                const service = new RecommendationFeedbackService(30)
                getMock.mockResolvedValue(
                    JSON.stringify({ [redisKey]: feedback }),
                )
                mockUserArtistPreference.findMany.mockRejectedValue(
                    new Error('DB error'),
                )

                const result = await (
                    service[getter as keyof typeof service] as any
                )('guild-1', 'user-1')

                expect(result.has(redisKey)).toBe(true)
                expect(result.size).toBe(1)
            },
        )
    })
})
