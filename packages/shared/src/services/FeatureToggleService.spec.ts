import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals'

const mockFindUnique = jest.fn<any>()
const mockUpsert = jest.fn<any>()
const mockPrismaClient = {
    globalFeatureToggle: {
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        upsert: (...args: unknown[]) => mockUpsert(...args),
    },
}

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrismaClient,
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

    describe('getDbGlobalOverride', () => {
        it('returns db value when row exists (enabled=true)', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const result = await (
                service as unknown as {
                    getDbGlobalOverride(name: string): Promise<boolean | null>
                }
            ).getDbGlobalOverride('DOWNLOAD_AUDIO')
            expect(result).toBe(true)
        })

        it('returns db value when row exists (enabled=false)', async () => {
            mockFindUnique.mockResolvedValue({ enabled: false })
            const result = await (
                service as unknown as {
                    getDbGlobalOverride(name: string): Promise<boolean | null>
                }
            ).getDbGlobalOverride('DOWNLOAD_AUDIO')
            expect(result).toBe(false)
        })

        it('returns null when no row found', async () => {
            mockFindUnique.mockResolvedValue(null)
            const result = await (
                service as unknown as {
                    getDbGlobalOverride(name: string): Promise<boolean | null>
                }
            ).getDbGlobalOverride('DOWNLOAD_AUDIO')
            expect(result).toBeNull()
        })

        it('returns null when db throws', async () => {
            mockFindUnique.mockRejectedValue(new Error('DB connection failed'))
            const result = await (
                service as unknown as {
                    getDbGlobalOverride(name: string): Promise<boolean | null>
                }
            ).getDbGlobalOverride('DOWNLOAD_AUDIO')
            expect(result).toBeNull()
        })
    })

    describe('setGlobalFeatureToggle', () => {
        it('upserts the toggle with correct args', async () => {
            mockUpsert.mockResolvedValue({})
            await service.setGlobalFeatureToggle('DOWNLOAD_VIDEO', true)
            expect(mockUpsert).toHaveBeenCalledWith({
                where: { name: 'DOWNLOAD_VIDEO' },
                update: { enabled: true },
                create: { name: 'DOWNLOAD_VIDEO', enabled: true },
            })
        })

        it('upserts with enabled=false', async () => {
            mockUpsert.mockResolvedValue({})
            await service.setGlobalFeatureToggle('DOWNLOAD_AUDIO', false)
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
                service.setGlobalFeatureToggle('DOWNLOAD_VIDEO', true),
            ).rejects.toThrow('DB write failed')
        })
    })

    describe('isEnabled', () => {
        it('delegates to isEnabledGlobal', async () => {
            mockFindUnique.mockResolvedValue(null)
            const result = await service.isEnabled('DOWNLOAD_VIDEO')
            expect(result).toBe(true)
        })
    })

    describe('getAllToggles', () => {
        it('returns a Map of all fallback toggles', () => {
            const toggles = service.getAllToggles()
            expect(toggles).toBeInstanceOf(Map)
            expect(toggles.get('DOWNLOAD_VIDEO')).toBe(true)
            expect(toggles.get('DOWNLOAD_AUDIO')).toBe(false)
        })
    })

    describe('getToggle', () => {
        it('returns the fallback value for a toggle', () => {
            expect(service.getToggle('DOWNLOAD_VIDEO')).toBe(true)
            expect(service.getToggle('DOWNLOAD_AUDIO')).toBe(false)
        })
    })

    describe('isEnabledGlobal with DB override', () => {
        it('returns db override (true) without checking Vercel', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const result = await service.isEnabledGlobal('DOWNLOAD_AUDIO')
            expect(result).toBe(true)
        })

        it('returns db override (false)', async () => {
            mockFindUnique.mockResolvedValue({ enabled: false })
            const result = await service.isEnabledGlobal('DOWNLOAD_VIDEO')
            expect(result).toBe(false)
        })

        it('falls back to fallback toggle when no db override', async () => {
            mockFindUnique.mockResolvedValue(null)
            const result = await service.isEnabledGlobal('DOWNLOAD_VIDEO')
            expect(result).toBe(true)
        })

        it('falls back to fallback toggle when db throws', async () => {
            mockFindUnique.mockRejectedValue(new Error('DB error'))
            const result = await service.isEnabledGlobal('DOWNLOAD_VIDEO')
            expect(result).toBe(true)
        })
    })

    describe('getGlobalToggleStatus', () => {
        it('returns provider as database when db override exists', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const status = await service.getGlobalToggleStatus('DOWNLOAD_VIDEO')
            expect(status).toEqual({
                enabled: true,
                provider: 'database',
                writable: true,
            })
        })

        it('returns provider as environment when no db override', async () => {
            mockFindUnique.mockResolvedValue(null)
            const status = await service.getGlobalToggleStatus('DOWNLOAD_VIDEO')
            expect(status).toEqual({
                enabled: true,
                provider: 'environment',
                writable: true,
            })
        })
    })

    describe('getGlobalToggleProvider', () => {
        it('always returns database', () => {
            expect(service.getGlobalToggleProvider()).toBe('database')
        })
    })
})
