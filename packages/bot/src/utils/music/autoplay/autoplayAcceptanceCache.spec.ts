import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const getPerSourceAcceptanceMock = jest.fn()

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getPerSourceAcceptance: (...args: unknown[]) =>
        getPerSourceAcceptanceMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

import {
    getPerSourceAcceptanceRateCached,
    clearAcceptanceCache,
} from './autoplayAcceptanceCache'

describe('autoplayAcceptanceCache', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        clearAcceptanceCache()
    })

    describe('getPerSourceAcceptanceRateCached', () => {
        it('should fetch from service on first call (cache miss)', async () => {
            const mockRows = [
                { source: 'spotify-rec', acceptanceRate: 0.87 },
                { source: 'lastfm-loved', acceptanceRate: 0.92 },
            ]
            getPerSourceAcceptanceMock.mockResolvedValueOnce(mockRows)

            const result = await getPerSourceAcceptanceRateCached('guild-123')

            expect(result).toEqual([
                { source: 'spotify-rec', acceptanceRate: 0.87 },
                { source: 'lastfm-loved', acceptanceRate: 0.92 },
            ])
            expect(getPerSourceAcceptanceMock).toHaveBeenCalledWith('guild-123')
            expect(getPerSourceAcceptanceMock).toHaveBeenCalledTimes(1)
        })

        it('should return cached result on second call within TTL', async () => {
            const mockRows = [{ source: 'spotify-rec', acceptanceRate: 0.87 }]
            getPerSourceAcceptanceMock.mockResolvedValueOnce(mockRows)

            await getPerSourceAcceptanceRateCached('guild-456')
            const result = await getPerSourceAcceptanceRateCached('guild-456')

            expect(result).toEqual([
                { source: 'spotify-rec', acceptanceRate: 0.87 },
            ])
            expect(getPerSourceAcceptanceMock).toHaveBeenCalledTimes(1)
        })

        it('should return empty array if service returns empty', async () => {
            getPerSourceAcceptanceMock.mockResolvedValueOnce([])

            const result = await getPerSourceAcceptanceRateCached('guild-789')

            expect(result).toEqual([])
        })

        it('should handle service errors gracefully and return empty array', async () => {
            getPerSourceAcceptanceMock.mockRejectedValueOnce(
                new Error('DB error'),
            )

            const result = await getPerSourceAcceptanceRateCached('guild-error')

            expect(result).toEqual([])
        })

        it('should cache per-guild independently', async () => {
            const rows1 = [{ source: 'spotify-rec', acceptanceRate: 0.87 }]
            const rows2 = [{ source: 'lastfm-loved', acceptanceRate: 0.92 }]
            getPerSourceAcceptanceMock
                .mockResolvedValueOnce(rows1)
                .mockResolvedValueOnce(rows2)

            const result1 = await getPerSourceAcceptanceRateCached('guild-a')
            const result2 = await getPerSourceAcceptanceRateCached('guild-b')

            expect(result1).toEqual(rows1)
            expect(result2).toEqual(rows2)
            expect(getPerSourceAcceptanceMock).toHaveBeenCalledTimes(2)
        })
    })

    describe('clearAcceptanceCache', () => {
        it('should clear all cached entries', async () => {
            const mockRows = [{ source: 'spotify-rec', acceptanceRate: 0.87 }]
            getPerSourceAcceptanceMock.mockResolvedValue(mockRows)

            await getPerSourceAcceptanceRateCached('guild-clear-test')
            clearAcceptanceCache()
            await getPerSourceAcceptanceRateCached('guild-clear-test')

            expect(getPerSourceAcceptanceMock).toHaveBeenCalledTimes(2)
        })
    })
})
