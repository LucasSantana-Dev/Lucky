import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import {
    setupGuildSettingsRoutes,
    settingsBody,
    musicModuleSettingsBody,
} from '../../../src/routes/guildSettings'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { MOCK_SESSION_DATA, MOCK_GUILD_CONTEXT } from '../../fixtures/mock-data'
import { GUILD_SETTINGS_EDITABLE_FIELDS } from '@lucky/shared/services'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('../../../src/services/GuildAccessService', () => ({
    guildAccessService: {
        resolveGuildContext: jest.fn(),
        hasAccess: jest.fn(),
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

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
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

        test('returns 403 for a user with no access to this guild (IDOR regression, #2243)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(mockGetSettings).not.toHaveBeenCalled()
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

        test('returns 500 and no success flag when the save fails (#2454)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSetSettings.mockResolvedValue(false)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ prefix: '!' })

            expect(res.status).toBe(500)
            expect(res.body.success).toBeUndefined()
            expect(res.body.error).toBe('Failed to save guild settings')
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

        test('returns 403 for a user without manage access to this guild (IDOR regression, #2243)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ prefix: '!' })

            expect(res.status).toBe(403)
            expect(mockSetSettings).not.toHaveBeenCalled()
        })
    })

    describe('musicModuleSettingsBody / editable field list agreement', () => {
        test('every music key appears in the shared editable field list', () => {
            for (const key of Object.keys(musicModuleSettingsBody.shape)) {
                expect(GUILD_SETTINGS_EDITABLE_FIELDS).toContain(key)
            }
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

        test('checks settings access regardless of slug — the handler reads the whole record, not a per-module projection (IDOR regression, #2243)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockGetSettings.mockResolvedValue({})

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >

            await request(app)
                .get(`/api/guilds/${GUILD_ID}/modules/moderation/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(mockGuildAccessService.hasAccess).toHaveBeenCalledWith(
                MOCK_GUILD_CONTEXT,
                'settings',
                'view',
            )
        })

        test('returns 400 for a slug that is not a real module', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/modules/not-a-module/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
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

        test('returns 500 and no success flag when the save fails (module route, #2454)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)
            mockSetSettings.mockResolvedValue(false)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ defaultVolume: 75 })

            expect(res.status).toBe(500)
            expect(res.body.success).toBeUndefined()
            expect(res.body.error).toBe('Failed to save guild settings')
        })

        describe('body scoped to the module (#2637)', () => {
            beforeEach(() => {
                ;(
                    sessionService as jest.Mocked<typeof sessionService>
                ).getSession.mockResolvedValue(MOCK_SESSION_DATA)
                mockSetSettings.mockResolvedValue(true)
            })

            const post = (slug: string, body: object) =>
                request(app)
                    .post(`/api/guilds/${GUILD_ID}/modules/${slug}/settings`)
                    .set('Cookie', ['sessionId=valid_session_id'])
                    .send(body)

            test('writes only the music fields it was given', async () => {
                const body = {
                    defaultVolume: 80,
                    autoPlayEnabled: false,
                    repeatMode: 2,
                    shuffleEnabled: true,
                }

                const res = await post('music', body)

                expect(res.status).toBe(200)
                expect(mockSetSettings).toHaveBeenCalledWith(GUILD_ID, body)
            })

            test.each([
                ['a non-music guild setting', { prefix: '!' }],
                ['an unknown key', { volume: 80 }],
                ['a string repeat mode', { repeatMode: 'off' }],
                ['an out-of-range volume', { defaultVolume: 9999 }],
            ])('rejects %s with 400 and no write', async (_label, body) => {
                const res = await post('music', body)

                expect(res.status).toBe(400)
                expect(mockSetSettings).not.toHaveBeenCalled()
            })

            test('returns 404 for a module without a settings form', async () => {
                const res = await post('moderation', { defaultVolume: 80 })

                expect(res.status).toBe(404)
                expect(mockSetSettings).not.toHaveBeenCalled()
            })
        })

        test('returns 403 for a user without manage access to the requested module (IDOR regression, #2243)', async () => {
            const mockSession = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSession.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            const res = await request(app)
                .post(`/api/guilds/${GUILD_ID}/modules/music/settings`)
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ defaultVolume: 75 })

            expect(res.status).toBe(403)
            expect(mockSetSettings).not.toHaveBeenCalled()
        })
    })
})
