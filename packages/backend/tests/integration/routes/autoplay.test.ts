import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

const mockGuildSettingsService = {
    getGuildSettings: jest.fn() as any,
    updateGuildSettings: jest.fn() as any,
}

jest.mock('@lucky/shared/services', () => ({
    guildSettingsService: mockGuildSettingsService,
}))

jest.mock('../../../src/middleware/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: 'test-discord-id' }
        next()
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

import { setupAutoplayRoutes } from '../../../src/routes/music/autoplayRoutes'

describe('Autoplay Routes', () => {
    let app: Express

    beforeEach(() => {
        jest.clearAllMocks()
        app = express()
        app.use(express.json())
        setupAutoplayRoutes(app)
    })

    describe('GET /api/guilds/:guildId/autoplay/genres', () => {
        it('returns empty genres when no settings exist', async () => {
            mockGuildSettingsService.getGuildSettings.mockResolvedValue(null)

            const res = await request(app).get(
                '/api/guilds/guild-123/autoplay/genres',
            )

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: [] })
        })

        it('returns genres from settings', async () => {
            mockGuildSettingsService.getGuildSettings.mockResolvedValue({
                autoplayGenres: ['rock', 'indie', 'jazz'],
            })

            const res = await request(app).get(
                '/api/guilds/guild-123/autoplay/genres',
            )

            expect(res.status).toBe(200)
            expect(res.body).toEqual({
                genres: ['rock', 'indie', 'jazz'],
            })
        })
    })

    describe('PUT /api/guilds/:guildId/autoplay/genres', () => {
        it('updates genres successfully', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(true)

            const res = await request(app)
                .put('/api/guilds/guild-123/autoplay/genres')
                .send({ genres: ['rock', 'pop'] })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: ['rock', 'pop'] })
            expect(
                mockGuildSettingsService.updateGuildSettings,
            ).toHaveBeenCalledWith('guild-123', {
                autoplayGenres: ['rock', 'pop'],
            })
        })

        it('rejects when genres is not an array', async () => {
            const res = await request(app)
                .put('/api/guilds/guild-123/autoplay/genres')
                .send({ genres: 'rock' })

            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Invalid request')
        })

        it('rejects when more than 5 genres', async () => {
            const res = await request(app)
                .put('/api/guilds/guild-123/autoplay/genres')
                .send({
                    genres: ['rock', 'pop', 'indie', 'jazz', 'metal', 'electronic'],
                })

            expect(res.status).toBe(400)
            expect(res.body.error).toBe('Limit exceeded')
        })

        it('normalizes and deduplicates genres', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(true)

            const res = await request(app)
                .put('/api/guilds/guild-123/autoplay/genres')
                .send({ genres: ['Rock', 'ROCK', '  rock  ', 'pop'] })

            expect(res.status).toBe(200)
            expect(res.body).toEqual({ genres: ['rock', 'pop'] })
        })

        it('handles update failure', async () => {
            mockGuildSettingsService.updateGuildSettings.mockResolvedValue(false)

            const res = await request(app)
                .put('/api/guilds/guild-123/autoplay/genres')
                .send({ genres: ['rock'] })

            expect(res.status).toBe(500)
            expect(res.body.error).toBe('Update failed')
        })
    })
})
