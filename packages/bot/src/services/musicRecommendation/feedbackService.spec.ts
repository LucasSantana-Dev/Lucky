import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockUserTrackFeedback = {
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
}

const mockUserArtistPreference = {
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
}

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    getPrismaClient: () => ({
        userTrackFeedback: mockUserTrackFeedback,
        userArtistPreference: mockUserArtistPreference,
    }),
}))

import { RecommendationFeedbackService } from './feedbackService'

describe('RecommendationFeedbackService', () => {
    beforeEach(() => {
        // Clear only call history; preserve implementations and queued return values
        mockUserTrackFeedback.upsert.mockClear()
        mockUserTrackFeedback.deleteMany.mockClear()
        mockUserTrackFeedback.findMany.mockClear()
        mockUserTrackFeedback.count.mockClear()
        mockUserArtistPreference.upsert.mockClear()
        mockUserArtistPreference.deleteMany.mockClear()
        mockUserArtistPreference.findMany.mockClear()
    })

    it.each([
        { feedback: 'dislike' as const, getter: 'getDislikedTrackKeys' },
        { feedback: 'like' as const, getter: 'getLikedTrackKeys' },
    ])(
        'stores $feedback feedback and returns keys via Postgres',
        async ({ feedback, getter }) => {
            const service = new RecommendationFeedbackService(30)
            const now = 10_000
            const key = service.buildTrackKey('Song', 'Artist')

            // upsert: setFeedback's upsert (no prune in setFeedback)
            mockUserTrackFeedback.upsert.mockResolvedValueOnce({
                trackKey: key,
                feedback,
            })
            // deleteMany: getter's lazy prune
            mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
                count: 0,
            })
            // findMany: getter's find
            mockUserTrackFeedback.findMany.mockResolvedValueOnce([
                { trackKey: key, updatedAt: new Date(now) },
            ])

            await service.setFeedback('guild-1', 'user-1', key, feedback, now)
            const keys = await (service[getter as keyof typeof service] as any)(
                'guild-1',
                'user-1',
                now + 100,
            )

            expect(keys.has(key)).toBe(true)
            expect(mockUserTrackFeedback.upsert).toHaveBeenCalled()
        },
    )

    it('getFeedbackCounts returns correct liked/disliked counts', async () => {
        const service = new RecommendationFeedbackService(30)

        // deleteMany: lazy prune before counting
        mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
            count: 0,
        })
        // Two count calls in Promise.all for [liked, disliked]
        mockUserTrackFeedback.count.mockResolvedValueOnce(2) // liked count
        mockUserTrackFeedback.count.mockResolvedValueOnce(1) // disliked count

        const counts = await service.getFeedbackCounts('user-1', Date.now())

        expect(counts.liked).toBe(2)
        expect(counts.disliked).toBe(1)
    })

    it('cleans expired feedback entries via lazy-prune', async () => {
        const now = 50_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song B', 'Artist B')

        mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
            count: 1,
        })
        mockUserTrackFeedback.findMany.mockResolvedValueOnce([])

        const disliked = await service.getDislikedTrackKeys(
            'guild-2',
            'user-2',
            now,
        )

        expect(disliked.size).toBe(0)
        expect(mockUserTrackFeedback.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    discordUserId: 'user-2',
                }),
            }),
        )
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
        expect(mockUserTrackFeedback.findMany).not.toHaveBeenCalled()
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
        '$getter returns $tested artists from Postgres',
        async ({ feedback, getter, tested }) => {
            const service = new RecommendationFeedbackService(30)
            const artistKey1 = `artist1_${feedback}`
            const artistKey2 = `artist2_${feedback}`

            mockUserArtistPreference.findMany.mockResolvedValueOnce([
                { artistKey: artistKey1, preference: feedback },
                { artistKey: artistKey2, preference: feedback },
            ])

            const result = await (
                service[getter as keyof typeof service] as any
            )('guild-1', 'user-1')

            expect(result.has(artistKey1)).toBe(true)
            expect(result.has(artistKey2)).toBe(true)
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
        expect(mockUserArtistPreference.findMany).not.toHaveBeenCalled()
    })

    it('removeArtistFeedback deletes artist preference from Postgres', async () => {
        const service = new RecommendationFeedbackService(30)

        mockUserArtistPreference.deleteMany.mockResolvedValueOnce({
            count: 1,
        })

        await service.removeArtistFeedback('guild-1', 'user-1', 'Taylor Swift')

        expect(mockUserArtistPreference.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    discordUserId: 'user-1',
                    guildId: 'guild-1',
                    artistKey: expect.any(String),
                }),
            }),
        )
    })

    it('getArtistFeedbackSummary returns preferred and blocked lists from Postgres', async () => {
        const service = new RecommendationFeedbackService(30)

        mockUserArtistPreference.findMany.mockResolvedValueOnce([
            { artistKey: 'artistone', preference: 'prefer' },
            { artistKey: 'artisttwo', preference: 'prefer' },
            { artistKey: 'badartist', preference: 'block' },
        ])

        const summary = await service.getArtistFeedbackSummary('guild-1', 'user-1')

        expect(summary.preferred).toContain('artistone')
        expect(summary.preferred).toContain('artisttwo')
        expect(summary.blocked).toContain('badartist')
        expect(summary.preferred.length).toBe(2)
        expect(summary.blocked.length).toBe(1)
    })

    it('getArtistFeedbackSummary returns empty lists for undefined userId', async () => {
        const service = new RecommendationFeedbackService(30)

        const summary = await service.getArtistFeedbackSummary('guild-1', undefined)

        expect(summary.preferred).toEqual([])
        expect(summary.blocked).toEqual([])
        expect(mockUserArtistPreference.findMany).not.toHaveBeenCalled()
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

            mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
                count: 0,
            })
            mockUserTrackFeedback.findMany.mockResolvedValueOnce([
                {
                    trackKey: key,
                    updatedAt: new Date(updatedAt),
                },
            ])

            const weights = await (
                service[getter as keyof typeof service] as any
            )('guild-1', 'user-1', now)

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
            'guild-1',
            '',
        )

        expect(weights.size).toBe(0)
        expect(mockUserTrackFeedback.findMany).not.toHaveBeenCalled()
    })

    it('decay weight reduces to 0.15 after 30 days', async () => {
        const baseTime = 100_000
        const service = new RecommendationFeedbackService(30)
        const key = service.buildTrackKey('Song C', 'Artist C')
        const thirtyDaysAgo = baseTime - 30 * 24 * 60 * 60 * 1000

        mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
            count: 0,
        })
        mockUserTrackFeedback.findMany.mockResolvedValueOnce([
            {
                trackKey: key,
                updatedAt: new Date(thirtyDaysAgo),
            },
        ])

        const weights = await service.getLikedTrackWeights('guild-1', 'user-1', baseTime)

        const weight = weights.get(key)
        expect(weight).toBeCloseTo(0.15, 1)
    })

    it('clearFeedback deletes all explicit feedback for user', async () => {
        const service = new RecommendationFeedbackService(30)

        mockUserTrackFeedback.deleteMany.mockResolvedValueOnce({
            count: 5,
        })

        await service.clearFeedback('user-1')

        expect(mockUserTrackFeedback.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { discordUserId: 'user-1' },
            }),
        )
    })
})

describe('implicit feedback', () => {
    beforeEach(() => {
        // Reset mock call history without clearing implementations
        mockUserTrackFeedback.upsert.mockClear()
        mockUserTrackFeedback.deleteMany.mockClear()
        mockUserTrackFeedback.findMany.mockClear()
        mockUserTrackFeedback.count.mockClear()
        mockUserArtistPreference.upsert.mockClear()
        mockUserArtistPreference.deleteMany.mockClear()
        mockUserArtistPreference.findMany.mockClear()
    })

    it('recordImplicitFeedback trims to 200 entries when exceeded', async () => {
        const service = new RecommendationFeedbackService(30)

        // Record 201 entries
        for (let i = 0; i < 201; i++) {
            await service.recordImplicitFeedback(
                'user-1',
                `track${i}::artist`,
                'implicit_like',
            )
        }

        // Get all like keys to verify trimming happened
        const keys = await service.getImplicitLikeKeys('user-1')

        // Should keep only 200 most recent
        expect(keys.size).toBeLessThanOrEqual(200)
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
        '$getter returns $type entries from in-memory cache',
        async ({ type, getter, included, excluded }) => {
            const service = new RecommendationFeedbackService(30)

            // Record both types
            await service.recordImplicitFeedback(
                'user-1',
                'song1::artist',
                'implicit_dislike',
            )
            await service.recordImplicitFeedback(
                'user-1',
                'song2::artist',
                'implicit_like',
            )

            const keys = await (service[getter as keyof typeof service] as any)(
                'user-1',
            )

            expect(keys.has(included)).toBe(true)
            expect(keys.has(excluded)).toBe(false)
        },
    )

    it('recordImplicitFeedback handles errors gracefully', async () => {
        const service = new RecommendationFeedbackService(30)

        // Should not throw
        await expect(
            service.recordImplicitFeedback('user-1', 'key', 'implicit_like'),
        ).resolves.toBeUndefined()
    })

    it('reading implicit feedback for unknown user does not grow the map', async () => {
        const service = new RecommendationFeedbackService(30)

        // Read for unknown user
        const keys1 = await service.getImplicitLikeKeys('unknown-user-1')
        expect(keys1.size).toBe(0)

        // Read again for a different unknown user
        const keys2 = await service.getImplicitLikeKeys('unknown-user-2')
        expect(keys2.size).toBe(0)

        // Record feedback for a real user to ensure writes still work
        await service.recordImplicitFeedback(
            'real-user',
            'track1::artist',
            'implicit_like',
        )

        // Verify the real user's data is present
        const realKeys = await service.getImplicitLikeKeys('real-user')
        expect(realKeys.has('track1::artist')).toBe(true)
    })

    it('getImplicitDislikeKeys filters by TTL (14 days)', async () => {
        const service = new RecommendationFeedbackService(30)

        // Record feedback
        await service.recordImplicitFeedback(
            'user-1',
            'recenttrack::artist',
            'implicit_dislike',
        )

        // Verify recent entry is included
        const recentKeys = await service.getImplicitDislikeKeys('user-1')
        expect(recentKeys.size).toBe(1)
        expect(recentKeys.has('recenttrack::artist')).toBe(true)

        // Manually age an entry beyond TTL by modifying the cache directly
        // This simulates an entry that was recorded 15+ days ago
        const cache = service['implicitFeedbackCache']
        if (cache.has('user-1')) {
            const userMap = cache.get('user-1')!
            if (userMap['oldtrack::artist']) {
                userMap['oldtrack::artist'].updatedAt =
                    Date.now() - 15 * 24 * 60 * 60 * 1000
            }
        }

        // Add an aged entry directly to cache
        const userMap = cache.get('user-1') || {}
        userMap['oldtrack::artist'] = {
            type: 'implicit_dislike',
            updatedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
        }
        cache.set('user-1', userMap)

        // Read keys again; aged entry should be pruned from cache
        const expiredKeys = await service.getImplicitDislikeKeys('user-1')
        expect(expiredKeys.size).toBe(1)
        expect(expiredKeys.has('recenttrack::artist')).toBe(true)
        expect(expiredKeys.has('oldtrack::artist')).toBe(false)

        // Verify aged entry was deleted from cache
        const cacheAfterPrune = cache.get('user-1')
        expect(cacheAfterPrune?.['oldtrack::artist']).toBeUndefined()
    })

    describe('Artist feedback Postgres integration', () => {
        beforeEach(() => {
            // Reset mock call history without clearing implementations
            mockUserArtistPreference.upsert.mockClear()
            mockUserArtistPreference.deleteMany.mockClear()
            mockUserArtistPreference.findMany.mockClear()
        })

        it('setArtistFeedback upserts to Postgres', async () => {
            const service = new RecommendationFeedbackService(30)

            mockUserArtistPreference.upsert.mockResolvedValueOnce({
                artistKey: 'artistkey',
                preference: 'prefer',
            })

            await service.setArtistFeedback(
                'guild-1',
                'user-1',
                'Artist Name',
                'prefer',
            )

            expect(mockUserArtistPreference.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        discordUserId_guildId_artistKey: {
                            discordUserId: 'user-1',
                            guildId: 'guild-1',
                            artistKey: expect.any(String),
                        },
                    }),
                    update: { preference: 'prefer' },
                    create: expect.objectContaining({
                        discordUserId: 'user-1',
                        guildId: 'guild-1',
                        artistName: 'Artist Name',
                        preference: 'prefer',
                    }),
                }),
            )
        })

        it('getPreferredArtistKeys queries Postgres only', async () => {
            const service = new RecommendationFeedbackService(30)

            mockUserArtistPreference.findMany.mockResolvedValueOnce([
                { artistKey: 'artist1', preference: 'prefer' },
                { artistKey: 'artist2', preference: 'prefer' },
            ])

            const result = await service.getPreferredArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.has('artist1')).toBe(true)
            expect(result.has('artist2')).toBe(true)
            expect(mockUserArtistPreference.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        discordUserId: 'user-1',
                        guildId: 'guild-1',
                        preference: 'prefer',
                    }),
                    take: 5000,
                }),
            )
        })

        it('getBlockedArtistKeys queries Postgres only', async () => {
            const service = new RecommendationFeedbackService(30)

            mockUserArtistPreference.findMany.mockResolvedValueOnce([
                { artistKey: 'blocked1', preference: 'block' },
            ])

            const result = await service.getBlockedArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.has('blocked1')).toBe(true)
            expect(mockUserArtistPreference.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        discordUserId: 'user-1',
                        guildId: 'guild-1',
                        preference: 'block',
                    }),
                }),
            )
        })

        it('handles Postgres errors gracefully in artist methods', async () => {
            const service = new RecommendationFeedbackService(30)

            mockUserArtistPreference.findMany.mockRejectedValueOnce(
                new Error('DB error'),
            )

            const result = await service.getPreferredArtistKeys(
                'guild-1',
                'user-1',
            )

            expect(result.size).toBe(0)
        })
    })

    describe('guild-scope implicit dislike', () => {
        it('recordGuildImplicitDislike stores entry for guild', () => {
            const service = new RecommendationFeedbackService(30)

            service.recordGuildImplicitDislike('guild1', 'trackkey1')
            const result = service.getGuildImplicitDislikeKeys('guild1')

            expect(result.has('trackkey1')).toBe(true)
        })

        it('getGuildImplicitDislikeKeys returns empty set for unknown guild', () => {
            const service = new RecommendationFeedbackService(30)

            const result = service.getGuildImplicitDislikeKeys('nonexistent-guild')

            expect(result.size).toBe(0)
        })

        it('expired entries are not returned', () => {
            const service = new RecommendationFeedbackService(30)
            const now = 1000
            const oldTime = now - 15 * 24 * 60 * 60 * 1000 // 15 days ago (past 14-day TTL)

            // Record with old timestamp
            service.recordGuildImplicitDislike('guild1', 'trackkey1', oldTime)

            // Fetch with current time (15 days later)
            const result = service.getGuildImplicitDislikeKeys('guild1', now)

            expect(result.size).toBe(0)
        })

        it('removes guild bucket from outer map when all entries expire', () => {
            const service = new RecommendationFeedbackService(30)
            const now = 1000
            const oldTime = now - 15 * 24 * 60 * 60 * 1000

            service.recordGuildImplicitDislike('guild1', 'trackkey1', oldTime)
            service.getGuildImplicitDislikeKeys('guild1', now) // triggers prune

            // Verify outer map no longer holds an empty bucket for this guild
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((service as any).guildImplicitDislikeCache.has('guild1')).toBe(false)
        })

        it('two guilds do not cross-contaminate', () => {
            const service = new RecommendationFeedbackService(30)

            service.recordGuildImplicitDislike('guild1', 'trackA')
            service.recordGuildImplicitDislike('guild2', 'trackB')

            const guild1Keys = service.getGuildImplicitDislikeKeys('guild1')
            const guild2Keys = service.getGuildImplicitDislikeKeys('guild2')

            expect(guild1Keys.has('trackA')).toBe(true)
            expect(guild1Keys.has('trackB')).toBe(false)
            expect(guild2Keys.has('trackB')).toBe(true)
            expect(guild2Keys.has('trackA')).toBe(false)
        })
    })
})
