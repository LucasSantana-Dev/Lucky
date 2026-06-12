import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../../utils/general/log.js', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn(),
}))

import { MusicControlService } from './MusicControlService.js'
import type { MusicCommand } from './types.js'

function buildCommand(): MusicCommand {
    return {
        id: 'cmd_test_1',
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'pause',
        timestamp: 0,
    } as MusicCommand
}

type WithClients = {
    publisher: { status: string } | null
    subscriber: { status: string } | null
}

describe('MusicControlService health', () => {
    it('is unhealthy before connect()', () => {
        const service = new MusicControlService()
        expect(service.isHealthy()).toBe(false)
    })

    it('is healthy only when both clients are ready', () => {
        const service = new MusicControlService()
        const internals = service as unknown as WithClients

        internals.publisher = { status: 'ready' }
        internals.subscriber = { status: 'reconnecting' }
        expect(service.isHealthy()).toBe(false)

        internals.subscriber = { status: 'ready' }
        expect(service.isHealthy()).toBe(true)
    })

    it('sendCommand fails fast with "Music service unavailable" when unhealthy', async () => {
        const service = new MusicControlService()

        const result = await service.sendCommand(buildCommand())

        expect(result.success).toBe(false)
        expect(result.error).toBe('Music service unavailable')
    })
})
