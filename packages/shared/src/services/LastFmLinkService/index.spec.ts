import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { LastFmLinkService } from './index'

const deleteMock =
    jest.fn<(args: { where: { discordId: string } }) => Promise<unknown>>()
const debugLogMock = jest.fn<(payload: unknown) => void>()
const errorLogMock = jest.fn<(payload: unknown) => void>()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        lastFmLink: {
            delete: (args: { where: { discordId: string } }) =>
                deleteMock(args),
        },
    }),
}))

jest.mock('../../utils/general/log', () => ({
    debugLog: (payload: unknown) => debugLogMock(payload),
    errorLog: (payload: unknown) => errorLogMock(payload),
}))

describe('LastFmLinkService.unlink', () => {
    const service = new LastFmLinkService()

    beforeEach(() => {
        deleteMock.mockReset()
        debugLogMock.mockReset()
        errorLogMock.mockReset()
    })

    it('returns true when delete succeeds', async () => {
        deleteMock.mockResolvedValue({})

        const result = await service.unlink('123')

        expect(result).toBe(true)
        expect(deleteMock).toHaveBeenCalledWith({ where: { discordId: '123' } })
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
            expect.objectContaining({ message: 'Last.fm link already absent' }),
        )
        expect(errorLogMock).not.toHaveBeenCalled()
    })

    it('returns false and logs error on unexpected failures', async () => {
        const dbError = new Error('db unavailable')
        deleteMock.mockRejectedValue(dbError)

        const result = await service.unlink('789')

        expect(result).toBe(false)
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Failed to unlink Last.fm' }),
        )
    })
})
