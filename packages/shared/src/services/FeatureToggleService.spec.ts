import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const mockFindUnique = jest.fn()
const mockUpsert = jest.fn()
const mockPrismaClient = {
    guildFeatureToggle: {
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        upsert: (...args: unknown[]) => mockUpsert(...args),
    },
}

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrismaClient,
}))

jest.mock('../config/unleash', () => ({
    unleash: null,
    isUnleashEnabled: () => false,
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

    beforeEach(async () => {
        jest.resetModules()
        mockFindUnique.mockReset()
        mockUpsert.mockReset()

        const mod = await import('./FeatureToggleService')
        service = mod.featureToggleService as unknown as typeof service
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

    describe('isEnabledForGuild with DB override', () => {
        it('returns db override (true) without checking unleash', async () => {
            mockFindUnique.mockResolvedValue({ enabled: true })
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_AUDIO',
                'guild-1',
            )
            expect(result).toBe(true)
        })

        it('returns db override (false) without checking unleash', async () => {
            mockFindUnique.mockResolvedValue({ enabled: false })
            const result = await service.isEnabledForGuild(
                'DOWNLOAD_VIDEO',
                'guild-1',
            )
            expect(result).toBe(false)
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
