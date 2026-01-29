import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupToggleRoutes } from '../../../src/routes/toggles'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { getFeatureToggleConfig } from '@lukbot/shared/config'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/services', () => ({
    featureToggleService: {
        getAllToggles: jest.fn(),
        isEnabledGlobal: jest.fn(),
        isEnabledForGuild: jest.fn(),
    },
}))

jest.mock('@lukbot/shared/config', () => ({
    getFeatureToggleConfig: jest.fn(() => ({
        DOWNLOAD_VIDEO: {
            name: 'DOWNLOAD_VIDEO',
            description: 'Download video feature',
        },
        DOWNLOAD_AUDIO: {
            name: 'DOWNLOAD_AUDIO',
            description: 'Download audio feature',
        },
    })),
}))

describe('Toggles Routes Integration', () => {
    let app: express.Express
    let featureToggleService: any

    beforeEach(async () => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupToggleRoutes(app)
        jest.clearAllMocks()

        const mockGetFeatureToggleConfig =
            getFeatureToggleConfig as jest.MockedFunction<
                typeof getFeatureToggleConfig
            >
        mockGetFeatureToggleConfig.mockReturnValue({
            DOWNLOAD_VIDEO: {
                name: 'DOWNLOAD_VIDEO',
                description: 'Download video feature',
            },
            DOWNLOAD_AUDIO: {
                name: 'DOWNLOAD_AUDIO',
                description: 'Download audio feature',
            },
        } as ReturnType<typeof getFeatureToggleConfig>)

        const sharedServices = await import('@lukbot/shared/services')
        featureToggleService = sharedServices.featureToggleService
    })

    describe('GET /api/toggles/global', () => {
        test('should return global toggles for developer', async () => {
            const developerSession = {
                ...MOCK_SESSION_DATA,
                userId: '123456789',
            }

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(developerSession)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
                ['DOWNLOAD_AUDIO', { name: 'DOWNLOAD_AUDIO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)
            mockFeatureToggleService.isEnabledGlobal.mockResolvedValue(true)

            const response = await request(app)
                .get('/api/toggles/global')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toHaveProperty('toggles')
            expect(mockFeatureToggleService.getAllToggles).toHaveBeenCalled()
        })

        test('should return 403 for non-developer', async () => {
            const nonDeveloperSession = {
                ...MOCK_SESSION_DATA,
                userId: '999999999',
            }

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(nonDeveloperSession)

            const response = await request(app)
                .get('/api/toggles/global')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(403)

            expect(response.body).toEqual({
                error: 'Developer access required',
            })
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app)
                .get('/api/toggles/global')
                .expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('GET /api/toggles/global/:name', () => {
        test('should return toggle state for developer', async () => {
            const developerSession = {
                ...MOCK_SESSION_DATA,
                userId: '123456789',
            }

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(developerSession)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)
            mockFeatureToggleService.isEnabledGlobal.mockResolvedValue(true)

            const response = await request(app)
                .get('/api/toggles/global/DOWNLOAD_VIDEO')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toEqual({
                name: 'DOWNLOAD_VIDEO',
                enabled: true,
            })
        })

        test('should return 400 for invalid toggle name', async () => {
            const developerSession = {
                ...MOCK_SESSION_DATA,
                userId: '123456789',
            }

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(developerSession)

            const mockToggles = new Map()

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)

            const response = await request(app)
                .get('/api/toggles/global/INVALID_TOGGLE')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(400)

            expect(response.body).toEqual({ error: 'Invalid toggle name' })
        })
    })

    describe('POST /api/toggles/global/:name', () => {
        test('should return success message for developer', async () => {
            const developerSession = {
                ...MOCK_SESSION_DATA,
                userId: '123456789',
            }

            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(developerSession)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)

            const response = await request(app)
                .post('/api/toggles/global/DOWNLOAD_VIDEO')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(200)

            expect(response.body).toHaveProperty('success', true)
            expect(response.body).toHaveProperty('message')
        })
    })

    describe('GET /api/features', () => {
        test('should return feature list', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/features')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toHaveProperty('features')
            expect(Array.isArray(response.body.features)).toBe(true)
        })

        test('should return 401 when not authenticated', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(null)

            const response = await request(app).get('/api/features').expect(401)

            expect(response.body).toEqual({
                error: 'Not authenticated',
            })
        })
    })

    describe('GET /api/guilds/:id/features', () => {
        test('should return guild features', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
                ['DOWNLOAD_AUDIO', { name: 'DOWNLOAD_AUDIO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)
            mockFeatureToggleService.isEnabledForGuild.mockResolvedValue(false)

            const response = await request(app)
                .get('/api/guilds/111111111111111111/features')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(200)

            expect(response.body).toHaveProperty(
                'guildId',
                '111111111111111111',
            )
            expect(response.body).toHaveProperty('toggles')
        })

        test('should return 400 when guild ID is missing', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const response = await request(app)
                .get('/api/guilds//features')
                .set('Cookie', ['sessionId=valid_session_id'])
                .expect(404)
        })
    })

    describe('POST /api/guilds/:id/features/:name', () => {
        test('should return success message', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/features/DOWNLOAD_VIDEO')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(200)

            expect(response.body).toHaveProperty('success', true)
        })

        test('should return 400 when enabled is not boolean', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockToggles = new Map([
                ['DOWNLOAD_VIDEO', { name: 'DOWNLOAD_VIDEO' }],
            ])

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/features/DOWNLOAD_VIDEO')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: 'not-a-boolean' })
                .expect(400)

            expect(response.body).toEqual({
                error: 'Enabled must be a boolean',
            })
        })

        test('should return 400 for invalid toggle name', async () => {
            const mockSessionService = sessionService as jest.Mocked<
                typeof sessionService
            >
            mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

            const mockToggles = new Map()

            const mockFeatureToggleService =
                featureToggleService as jest.Mocked<typeof featureToggleService>
            mockFeatureToggleService.getAllToggles.mockReturnValue(mockToggles)

            const response = await request(app)
                .post('/api/guilds/111111111111111111/features/INVALID_TOGGLE')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ enabled: true })
                .expect(400)

            expect(response.body).toEqual({ error: 'Invalid toggle name' })
        })
    })
})
