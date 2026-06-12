import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupMusicRoutes } from '../../../src/routes/music'

const mockIsHealthy = jest.fn<() => boolean>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        isHealthy: () => mockIsHealthy(),
        connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        subscribeToResults: jest
            .fn<() => Promise<void>>()
            .mockResolvedValue(undefined),
        subscribeToState: jest
            .fn<() => Promise<void>>()
            .mockResolvedValue(undefined),
        sendCommand: jest.fn(),
        getState: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    },
    MusicControlService: {
        createCommandId: () => 'test-cmd-id',
    },
}))

describe('music service degradation gate (#1280)', () => {
    let app: express.Express

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(express.json())
        setupMusicRoutes(app)
    })

    const GUILD_ID = '111111111111111111'

    test('mutating music routes return 503 while the bridge is unhealthy', async () => {
        mockIsHealthy.mockReturnValue(false)

        const res = await request(app)
            .post(`/api/guilds/${GUILD_ID}/music/pause`)
            .expect(503)

        expect(res.body).toEqual({ error: 'Music service unavailable' })
    })

    test('GET state routes pass the gate while unhealthy (degrade via null state, not 503)', async () => {
        mockIsHealthy.mockReturnValue(false)

        // Without an auth session the route itself answers 401 — reaching it
        // proves the gate let the request through instead of 503ing.
        const res = await request(app).get(
            `/api/guilds/${GUILD_ID}/music/state`,
        )

        expect(res.status).not.toBe(503)
    })

    test('mutating music routes pass the gate when healthy', async () => {
        mockIsHealthy.mockReturnValue(true)

        const res = await request(app).post(
            `/api/guilds/${GUILD_ID}/music/pause`,
        )

        expect(res.status).not.toBe(503)
    })
})
