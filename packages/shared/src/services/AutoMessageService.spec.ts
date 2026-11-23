import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindFirst = jest.fn() as jest.MockedFunction<
    (...args: any[]) => Promise<any>
>

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        autoMessage: { findFirst: mockFindFirst },
    }),
}))

jest.mock('../generated/prisma/client', () => ({ Prisma: {} }))

import { AutoMessageService } from './AutoMessageService'

describe('AutoMessageService.getMessageInGuild', () => {
    const service = new AutoMessageService()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('looks the message up by id and guild together', async () => {
        mockFindFirst.mockResolvedValue({ id: 'msg1', guildId: 'guild1' })

        const result = await service.getMessageInGuild('guild1', 'msg1')

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: 'msg1', guildId: 'guild1' },
        })
        expect(result).toEqual({ id: 'msg1', guildId: 'guild1' })
    })

    it('returns null when the id belongs to another guild', async () => {
        mockFindFirst.mockResolvedValue(null)

        await expect(
            service.getMessageInGuild('guild1', 'other-guild-msg'),
        ).resolves.toBeNull()
    })
})
