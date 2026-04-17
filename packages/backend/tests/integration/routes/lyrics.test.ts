import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupLyricsRoutes } from '../../../src/routes/lyrics'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockSearchLyrics = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    lyricsService: {
        searchLyrics: (...args: any[]) => mockSearchLyrics(...args),
    },
}))

describe.skip('Lyrics Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupLyricsRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('GET /api/lyrics', () => {
        test('should return lyrics for title and artist', async () => {
            authed()
            const result = {
                title: 'Bohemian Rhapsody',
                artist: 'Queen',
                lyrics: 'Is this the real life...',
                source: 'lyrics.ovh',
            }
            mockSearchLyrics.mockResolvedValue(result)

            const res = await request(app)
                .get('/api/lyrics?title=Bohemian+Rhapsody&artist=Queen')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.title).toBe('Bohemian Rhapsody')
            expect(res.body.lyrics).toBeDefined()
            expect(mockSearchLyrics).toHaveBeenCalledWith(
                'Bohemian Rhapsody',
                'Queen',
            )
        })

        test('should search with title only', async () => {
            authed()
            mockSearchLyrics.mockResolvedValue({
                error: 'NOT_FOUND',
                message: 'Could not find lyrics',
            })

            const res = await request(app)
                .get('/api/lyrics?title=Unknown+Song')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.error).toBe('NOT_FOUND')
            expect(mockSearchLyrics).toHaveBeenCalledWith(
                'Unknown Song',
                undefined,
            )
        })

        test('should return 400 without title', async () => {
            authed()

            const res = await request(app)
                .get('/api/lyrics')
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(400)
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get('/api/lyrics?title=Test')

            expect(res.status).toBe(401)
        })
    })
})
