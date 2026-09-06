import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

interface MockGuildSettingsService {
    getGuildSettings: jest.Mock<Promise<unknown>>
    updateGuildSettings: jest.Mock<Promise<boolean>>
}

const mockGuildSettingsService: MockGuildSettingsService = {
    getGuildSettings: jest.fn(),
    updateGuildSettings: jest.fn(),
}

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: mockGuildSettingsService,
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
}))

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

import { setupSessionMiddleware } from '../../../src/middleware/session'
import { setupAutoplayRoutes } from '../../../src/routes/music/autoplayRoutes'
import { errorHandler } from '../../../src/middleware/errorHandler'
import { sessionService } from '../../../src/services/SessionService'
import { guildAccessService } from '../../../src/services/GuildAccessService'
import { MOCK_SESSION_DATA, MOCK_GUILD_CONTEXT } from '../../fixtures/mock-data'

describe('Autoplay Routes', () => {
    let app: Express

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupAutoplayRoutes(app)
        app.use(errorHandler)

        const mockSessionService = sessionService as jest.Mocked<
            typeof sessionService
        >
        mockSessionService.getSession.mockResolvedValue(MOCK_SESSION_DATA)

        const mockGuildAccessService = guildAccessService as jest.Mocked<
            typeof guildAccessService
        >
        mockGuildAccessService.resolveGuildContext.mockResolvedValue(
            MOCK_GUILD_CONTEXT,
        )
        mockGuildAccessService.hasAccess.mockReturnValue(true)
    })

    describe('GET /api/guilds/:guildId/autoplay/genres', () => {
        it('returns empty genres when no settings exist', async () => {
            mockGuildSettingsService.getGuildSettings.mockResolvedValue(null)

            const res = await request(app)
                .get('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: [] })
        })

        it('returns genres from settings', async () => {
            mockGuildSettingsService.getGuildSettings.mockResolvedValue({
                autoplayGenres: ['rock', 'indie', 'jazz'],
            })

            const res = await request(app)
                .get('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body).toEqual({
                genres: ['rock', 'indie', 'jazz'],
            })
        })

        it('returns 403 for a user with no access to this guild (IDOR regression, #2243)', async () => {
            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.resolveGuildContext.mockResolvedValue(null)

            const res = await request(app)
                .get('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(403)
            expect(
                mockGuildSettingsService.getGuildSettings,
            ).not.toHaveBeenCalled()
        })
    })

    describe('PUT /api/guilds/:guildId/autoplay/genres', () => {
        it('updates genres successfully', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(true)

            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ genres: ['rock', 'pop'] })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: ['rock', 'pop'] })
            expect(
                mockGuildSettingsService.updateGuildSettings,
            ).toHaveBeenCalledWith('123456789012345678', {
                autoplayGenres: ['rock', 'pop'],
            })
        })

        it('rejects when genres is not an array', async () => {
            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ genres: 'rock' })

            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Invalid request')
        })

        it('rejects when more than 5 genres', async () => {
            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({
                    genres: [
                        'rock',
                        'pop',
                        'indie',
                        'jazz',
                        'metal',
                        'electronic',
                    ],
                })

            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Limit exceeded')
        })

        it('normalizes and deduplicates genres', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(true)

            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ genres: ['Rock', 'ROCK', '  rock  ', 'pop'] })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: ['rock', 'pop'] })
        })

        it('handles update failure', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(
                false,
            )

            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ genres: ['rock'] })

            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Update failed')
        })

        it('returns 403 for a user without manage access to this guild (IDOR regression, #2243)', async () => {
            const mockGuildAccessService = guildAccessService as jest.Mocked<
                typeof guildAccessService
            >
            mockGuildAccessService.hasAccess.mockReturnValue(false)

            const res = await request(app)
                .put('/api/guilds/123456789012345678/autoplay/genres')
                .set('Cookie', ['sessionId=valid_session_id'])
                .send({ genres: ['rock'] })

            expect(res.status).toBe(403)
            expect(
                mockGuildSettingsService.updateGuildSettings,
            ).not.toHaveBeenCalled()
        })
    })
})
