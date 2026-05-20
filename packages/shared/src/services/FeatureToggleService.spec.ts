import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals'

// Per-guild feature toggles were retired in PR #801 (admin panel for global
// toggles). See docs/decisions/2026-05-19-retire-per-guild-feature-toggles.md.
// This spec only covers the surviving global Vercel-flag + DB-override path.

const mockGlobalFindUnique = jest.fn<any>()
const mockGlobalUpsert = jest.fn<any>()
const mockPrismaClient = {
    globalFeatureToggle: {
        findUnique: (...args: unknown[]) => mockGlobalFindUnique(...args),
        upsert: (...args: unknown[]) => mockGlobalUpsert(...args),
    },
}
const mockEvaluate = jest.fn<any>()
const mockCreateClient = jest.fn<any>(() => ({
    evaluate: (...args: unknown[]) => mockEvaluate(...args),
}))

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrismaClient,
}))

jest.mock('@vercel/flags-core', () => ({
    createClient: (sdkKey: string) => mockCreateClient(sdkKey),
}))

jest.mock('../config/featureToggles', () => ({
    getFeatureToggleConfig: () => ({
        DOWNLOAD_VIDEO: {
            name: 'DOWNLOAD_VIDEO',
            description: 'test',
            enabled: true,
        },
        DOWNLOAD_AUDIO: {
            name: 'DOWNLOAD_AUDIO',
            description: 'test',
            enabled: false,
        },
    }),
}))

jest.mock('../utils/general/log', () => ({
    debugLog: jest.fn(),
}))

describe('FeatureToggleService', () => {
    let service: InstanceType<
        (typeof import('./FeatureToggleService'))['featureToggleService'] extends infer S
            ? S extends object
                ? { new (): S }
                : never
            : never
    >
    const originalFlags = process.env.FLAGS

    beforeEach(async () => {
        jest.resetModules()
        delete process.env.FLAGS
        mockGlobalFindUnique.mockReset()
        mockGlobalUpsert.mockReset()
        mockEvaluate.mockReset()
        mockCreateClient.mockClear()
        mockGlobalFindUnique.mockResolvedValue(null)

        const mod = await import('./FeatureToggleService')
        service = mod.featureToggleService as unknown as typeof service
    })

    afterAll(() => {
        if (originalFlags === undefined) {
            delete process.env.FLAGS
        } else {
            process.env.FLAGS = originalFlags
        }
    })

    describe('global Vercel flags', () => {
        it('uses fallback toggles when FLAGS is not configured', async () => {
            const enabled = await service.isEnabledGlobal('DOWNLOAD_VIDEO')
            const disabled = await service.isEnabledGlobal('DOWNLOAD_AUDIO')

            expect(enabled).toBe(true)
            expect(disabled).toBe(false)
            expect(mockCreateClient).not.toHaveBeenCalled()
        })

        it('uses a Vercel true value over a false fallback', async () => {
            process.env.FLAGS = 'vf_test'
            jest.resetModules()
            mockEvaluate.mockResolvedValue({
                value: true,
                reason: 'fallthrough',
            })

            const mod = await import('./FeatureToggleService')
            const result =
                await mod.featureToggleService.isEnabledGlobal('DOWNLOAD_AUDIO')

            expect(result).toBe(true)
            expect(mockCreateClient).toHaveBeenCalledWith('vf_test')
            expect(mockEvaluate).toHaveBeenCalledWith('DOWNLOAD_AUDIO', false)
        })

        it('uses a Vercel false value over a true fallback', async () => {
            process.env.FLAGS = 'vf_test'
            jest.resetModules()
            mockEvaluate.mockResolvedValue({
                value: false,
                reason: 'fallthrough',
            })

            const mod = await import('./FeatureToggleService')
            const result =
                await mod.featureToggleService.isEnabledGlobal('DOWNLOAD_VIDEO')

            expect(result).toBe(false)
        })

        it('falls back when Vercel returns an error result', async () => {
            process.env.FLAGS = 'vf_test'
            jest.resetModules()
            mockEvaluate.mockResolvedValue({
                value: false,
                reason: 'error',
                errorMessage: 'flag not found',
            })

            const mod = await import('./FeatureToggleService')
            const result =
                await mod.featureToggleService.isEnabledGlobal('DOWNLOAD_VIDEO')

            expect(result).toBe(true)
        })

        it('falls back when Vercel returns a non-boolean value', async () => {
            process.env.FLAGS = 'vf_test'
            jest.resetModules()
            mockEvaluate.mockResolvedValue({
                value: 'enabled',
                reason: 'fallthrough',
            })

            const mod = await import('./FeatureToggleService')
            const result =
                await mod.featureToggleService.isEnabledGlobal('DOWNLOAD_VIDEO')

            expect(result).toBe(true)
        })

        it('reports provider metadata for global toggles', async () => {
            process.env.FLAGS = 'vf_test'
            jest.resetModules()
            mockEvaluate.mockResolvedValue({
                value: false,
                reason: 'fallthrough',
            })

            const mod = await import('./FeatureToggleService')
            const status =
                await mod.featureToggleService.getGlobalToggleStatus(
                    'DOWNLOAD_VIDEO',
                )

            expect(status).toEqual({
                enabled: false,
                provider: 'vercel',
                writable: false,
            })
            expect(mod.featureToggleService.getGlobalToggleProvider()).toBe(
                'vercel',
            )
        })
    })
})
