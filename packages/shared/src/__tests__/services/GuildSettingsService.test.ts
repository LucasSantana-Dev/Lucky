import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import { GuildSettingsService } from '../../services/GuildSettingsService'
import { redisClient } from '../../services/redis'

jest.mock('../../services/redis', () => ({
    redisClient: {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

const mockGet = redisClient.get as jest.MockedFunction<typeof redisClient.get>
const mockSetex = redisClient.setex as unknown as jest.MockedFunction<
    (key: string, ttl: number, value: string) => Promise<string>
>

describe('GuildSettingsService.updateGuildSettings (upsert)', () => {
    let service: GuildSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new GuildSettingsService(60)
    })

    test('seeds defaults and persists when no existing settings', async () => {
        mockGet.mockResolvedValue(null)
        mockSetex.mockResolvedValue('OK')

        const result = await service.updateGuildSettings('guild-1', {
            autoplayGenres: ['rock', 'jazz'],
        })

        expect(result).toBe(true)
        expect(mockSetex).toHaveBeenCalledTimes(1)
        const call = mockSetex.mock.calls[0]
        expect(call[0]).toBe('guild_settings:guild-1')
        expect(call[1]).toBe(60)
        const persisted = JSON.parse(call[2] as string)
        expect(persisted.guildId).toBe('guild-1')
        expect(persisted.autoplayGenres).toEqual(['rock', 'jazz'])
        expect(persisted.defaultVolume).toBe(50) // from defaults
    })

    test('merges updates with existing settings', async () => {
        mockGet.mockResolvedValue(
            JSON.stringify({
                guildId: 'guild-1',
                defaultVolume: 80,
                autoplayGenres: ['old'],
                autoPlayEnabled: true,
            }),
        )
        mockSetex.mockResolvedValue('OK')

        const result = await service.updateGuildSettings('guild-1', {
            autoplayGenres: ['rock'],
        })

        expect(result).toBe(true)
        const persisted = JSON.parse(mockSetex.mock.calls[0][2] as string)
        expect(persisted.defaultVolume).toBe(80) // preserved from existing
        expect(persisted.autoplayGenres).toEqual(['rock']) // overwritten
        expect(persisted.guildId).toBe('guild-1')
    })

    test('returns false when redis throws', async () => {
        mockGet.mockResolvedValue(null)
        mockSetex.mockRejectedValue(new Error('redis down'))

        const result = await service.updateGuildSettings('guild-1', {
            autoplayGenres: ['rock'],
        })

        expect(result).toBe(false)
    })
})
