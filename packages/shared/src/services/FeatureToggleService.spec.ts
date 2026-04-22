import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals'

const mockFindUnique = jest.fn<any>()
const mockUpsert = jest.fn<any>()
const mockPrismaClient = {
    guildFeatureToggle: {
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        upsert: (...args: unknown[]) => mockUpsert(...args),
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
        mockFindUnique.mockReset()
        mockUpsert.mockReset()
        mockEvaluate.mockReset()
        mockCreateClient.mockClear()

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

    describe('getDbOverride (via isEnabledForGuild)', () => {
        it('returns db value when row exists (enabled=true)', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const result = await (
                service as unknown as {
                    getDbOverride(
                        guildId: string,
                        name: string,
                    ): Promise<boolean | null>
                }
            ).getDbOverride('guild-1', 'DOWNLOAD_AUDIO')
            expect(result).toBe(true)
        })

        it('returns db value when row exists (enabled=false)', async () => {
            mockFindUnique.mockResolvedValue({ enabled: false })
            const result = await (
                service as unknown as {
                    getDbOverride(
                        guildId: string,
                        name: string,
                    ): Promise<boolean | null>
                }
            ).getDbOverride('guild-1', 'DOWNLOAD_AUDIO')
            expect(result).toBe(false)
        })

        it('returns null when no row found', async () => {
            mockFindUnique.mockResolvedValue(null)
            const result = await (
                service as unknown as {
                    getDbOverride(
                        guildId: string,
                        name: string,
                    ): Promise<boolean | null>
                }
            ).getDbOverride('guild-1', 'DOWNLOAD_AUDIO')
            expect(result).toBeNull()
        })

        it('returns null when db throws', async () => {
            mockFindUnique.mockRejectedValue(new Error('DB connection failed'))
            const result = await (
                service as unknown as {
                    getDbOverride(
                        guildId: string,
                        name: string,
                    ): Promise<boolean | null>
                }
            ).getDbOverride('guild-1', 'DOWNLOAD_AUDIO')
            expect(result).toBeNull()
        })
    })

    describe('setGuildFeatureToggle', () => {
        it('upserts the toggle with correct args', async () => {
            mockUpsert.mockResolvedValue({})
            await service.setGuildFeatureToggle(
                'guild-1',
                'DOWNLOAD_VIDEO',
                true,
            )
            expect(mockUpsert).toHaveBeenCalledWith({
                where: {
                    guildId_name: {
                        guildId: 'guild-1',
                        name: 'DOWNLOAD_VIDEO',
                    },
                },
                update: { enabled: true },
                create: {
                    guildId: 'guild-1',
                    name: 'DOWNLOAD_VIDEO',
                    enabled: true,
                },
            })
        })

        it('upserts with enabled=false', async () => {
            mockUpsert.mockResolvedValue({})
            await service.setGuildFeatureToggle(
                'guild-1',
                'DOWNLOAD_AUDIO',
                false,
            )
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: { enabled: false },
                    create: expect.objectContaining({ enabled: false }),
                }),
            )
        })

        it('propagates db errors', async () => {
            mockUpsert.mockRejectedValue(new Error('DB write failed'))
            await expect(
                service.setGuildFeatureToggle(
                    'guild-1',
                    'DOWNLOAD_VIDEO',
                    true,
                ),
            ).rejects.toThrow('DB write failed')
        })
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

    describe('isEnabledForGuild with DB override', () => {
        it('returns db override (true) without checking Vercel', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_AUDIO',
                'guild-1',
            )
            expect(result).toBe(true)
        })

        it('returns db override (false) without checking Vercel', async () => {
            process.env.FLAGS = 'vf_test'
            mockEvaluate.mockResolvedValue({
                value: true,
                reason: 'fallthrough',
            })
            mockFindUnique.mockResolvedValue({ enabled: false })
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_VIDEO',
                'guild-1',
            )
            expect(result).toBe(false)
            expect(mockEvaluate).not.toHaveBeenCalled()
        })

        it('falls back to fallback toggle when no db override', async () => {
            mockFindUnique.mockResolvedValue(null)
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_VIDEO',
                'guild-1',
            )
            expect(result).toBe(true)
        })

        it('falls back to fallback toggle when db throws', async () => {
            mockFindUnique.mockRejectedValue(new Error('DB error'))
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_VIDEO',
                'guild-1',
            )
            expect(result).toBe(true)
        })
    })
})
