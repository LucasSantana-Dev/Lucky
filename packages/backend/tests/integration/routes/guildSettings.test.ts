import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import {
    setupGuildSettingsRoutes,
    settingsBody,
} from '../../../src/routes/guildSettings'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'
import { GUILD_SETTINGS_EDITABLE_FIELDS } from '@lucky/shared/services'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockGetSettings = jest.fn<any>()
const mockSetSettings = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    ...(jest.requireActual('@lucky/shared/services') as object),
    guildSettingsService: {
        getGuildSettings: (...args: any[]) => mockGetSettings(...args),
        setGuildSettings: (...args: any[]) => mockSetSettings(...args),
    },
}))

describe('Guild Settings Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupGuildSettingsRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    describe('GET /api/guilds/:guildId/settings', () => {
        test('should return settings when authenticated', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const settings = {
                prefix: '!',
                embedColor: '0x5865F2',
                language: 'en',
                allowPlaylists: true,
                allowSpotify: true,
                commandCooldown: 3,
                maxQueueSize: 100,
                defaultVolume: 50,
                voteSkipThreshold: 50,
            }
            mockGetSettings.mockResolvedValue(settings)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings).toEqual(settings)
        })

        test('should return defaults when no settings exist', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockGetSettings.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings.prefix).toBe('/')
        })

        test('should return 401 when not authenticated', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/settings`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('POST /api/guilds/:guildId/settings', () => {
        test('should update settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSetSettings.mockResolvedValue(true)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ prefix: '!', defaultVolume: 75 })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
            expect(mockSetSettings).toHaveBeenCalledWith(GUILD_ID, {
                prefix: '!',
                defaultVolume: 75,
            })
        })

        test('rejects fields with no reader (regression guard for #2219)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    nickname: 'NewName',
                    commandPrefix: '!',
                    managerRoles: [],
                    updatesChannel: '',
                    disableWarnings: false,
                })

            expect(res.status).toBe(400)
        })

        test('should reject invalid fields', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ invalidField: 'value' })

            expect(res.status).toBe(400)
        })
    })

    describe('settingsBody schema / editable field list agreement', () => {
        test('every schema key appears in the shared editable field list', () => {
            const schemaKeys = Object.keys(settingsBody.shape)

            expect(schemaKeys.length).toBeGreaterThan(0)
            for (const key of schemaKeys) {
                expect(GUILD_SETTINGS_EDITABLE_FIELDS).toContain(key)
            }
        })
    })

    describe('GET /api/guilds/:guildId/modules/:slug/settings', () => {
        test('should return module settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const settings = { defaultVolume: 50, autoPlayEnabled: true }
            mockGetSettings.mockResolvedValue(settings)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.settings).toEqual(settings)
        })
    })

    describe('POST /api/guilds/:guildId/modules/:slug/settings', () => {
        test('should update module settings', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSetSettings.mockResolvedValue(true)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ defaultVolume: 75 })

            expect(res.status).toBe(200)
            expect(res.body.success).toBe(true)
        })
    })
})
