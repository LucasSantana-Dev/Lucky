import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LastFmLinkService } from './index'

const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>()
const upsertMock = jest.fn<(args: unknown) => Promise<unknown>>()
const deleteMock = jest.fn<(args: unknown) => Promise<unknown>>()
const debugLogMock = jest.fn<(payload: unknown) => void>()
const errorLogMock = jest.fn<(payload: unknown) => void>()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        lastFmLink: {
            findUnique: (args: unknown) => findUniqueMock(args),
            upsert: (args: unknown) => upsertMock(args),
            delete: (args: unknown) => deleteMock(args),
        },
    }),
}))

jest.mock('../../utils/general/log', () => ({
    debugLog: (payload: unknown) => debugLogMock(payload),
    errorLog: (payload: unknown) => errorLogMock(payload),
}))

describe('LastFmLinkService', () => {
    const service = new LastFmLinkService()

    beforeEach(() => {
        findUniqueMock.mockReset()
        upsertMock.mockReset()
        deleteMock.mockReset()
        debugLogMock.mockReset()
        errorLogMock.mockReset()
    })

    describe('getByDiscordId', () => {
        it('returns row data when record exists', async () => {
            findUniqueMock.mockResolvedValue({
                sessionKey: 'sk-abc',
                lastFmUsername: 'testuser',
            })

            const result = await service.getByDiscordId('123')

            expect(result).toEqual({
                sessionKey: 'sk-abc',
                lastFmUsername: 'testuser',
            })
            expect(findUniqueMock).toHaveBeenCalledWith({
                where: { discordId: '123' },
            })
        })

        it('returns null when record does not exist', async () => {
            findUniqueMock.mockResolvedValue(null)

            const result = await service.getByDiscordId('456')

            expect(result).toBeNull()
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('returns null and logs error on db failure', async () => {
            findUniqueMock.mockRejectedValue(new Error('db error'))

            const result = await service.getByDiscordId('789')

            expect(result).toBeNull()
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to get Last.fm link',
                }),
            )
        })
    })

    describe('getSessionKey', () => {
        it('returns sessionKey when record exists', async () => {
            findUniqueMock.mockResolvedValue({
                sessionKey: 'sk-xyz',
                lastFmUsername: null,
            })

            const result = await service.getSessionKey('123')

            expect(result).toBe('sk-xyz')
        })

        it('returns null when record does not exist', async () => {
            findUniqueMock.mockResolvedValue(null)

            const result = await service.getSessionKey('456')

            expect(result).toBeNull()
        })
    })

    describe('set', () => {
        it('returns true and logs on success', async () => {
            upsertMock.mockResolvedValue({})

            const result = await service.set('123', 'sk-abc', 'testuser')

            expect(result).toBe(true)
            expect(upsertMock).toHaveBeenCalledWith(
                expect.objectContaining({ where: { discordId: '123' } }),
            )
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Last.fm link saved' }),
            )
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('includes lastFmUsername in create when provided', async () => {
            upsertMock.mockResolvedValue({})

            await service.set('123', 'sk-abc', 'testuser')

            const call = upsertMock.mock.calls[0]?.[0] as {
                create: { lastFmUsername?: string }
            }
            expect(call.create.lastFmUsername).toBe('testuser')
        })

        it('excludes lastFmUsername from create when empty string', async () => {
            upsertMock.mockResolvedValue({})

            await service.set('123', 'sk-abc', '')

            const call = upsertMock.mock.calls[0]?.[0] as {
                create: { lastFmUsername?: string }
            }
            expect(call.create).not.toHaveProperty('lastFmUsername')
        })

        it('excludes lastFmUsername from create when null', async () => {
            upsertMock.mockResolvedValue({})

            await service.set('123', 'sk-abc', null)

            const call = upsertMock.mock.calls[0]?.[0] as {
                create: { lastFmUsername?: string }
            }
            expect(call.create).not.toHaveProperty('lastFmUsername')
        })

        it('returns false and logs error on db failure', async () => {
            upsertMock.mockRejectedValue(new Error('upsert failed'))

            const result = await service.set('123', 'sk-abc')

            expect(result).toBe(false)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to set Last.fm link',
                }),
            )
        })
    })

    describe('unlink', () => {
        it('returns true when delete succeeds', async () => {
            deleteMock.mockResolvedValue({})

            const result = await service.unlink('123')

            expect(result).toBe(true)
            expect(deleteMock).toHaveBeenCalledWith({
                where: { discordId: '123' },
            })
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Last.fm link removed' }),
            )
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('returns true when record is already absent (P2025)', async () => {
            deleteMock.mockRejectedValue({ code: 'P2025' })

            const result = await service.unlink('456')

            expect(result).toBe(true)
            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Last.fm link already absent',
                }),
            )
            expect(errorLogMock).not.toHaveBeenCalled()
        })

        it('returns false and logs error on unexpected failures', async () => {
            const dbError = new Error('db unavailable')
            deleteMock.mockRejectedValue(dbError)

            const result = await service.unlink('789')

            expect(result).toBe(false)
            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Failed to unlink Last.fm',
                }),
            )
        })
    })
})
