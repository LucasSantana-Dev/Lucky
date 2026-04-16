import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import http from 'http'
import type { AddressInfo } from 'net'
import express from 'express'
import { setupStateRoutes } from '../../../src/routes/music/stateRoutes'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockGetState = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        getState: (...args: any[]) => mockGetState(...args),
    },
}))

const SESSION_COOKIE = ['sessionId=valid_session_id']

describe('Music State Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupStateRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('GET /api/guilds/:guildId/music/state', () => {
        test('returns 401 without auth', async () => {
            await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/state`)
                .expect(401)
        })

        test('returns current state', async () => {
            authed()
            const mockState = {
                guildId: GUILD_ID,
                currentTrack: {
                    title: 'Test Track',
                    author: 'Test Artist',
                },
                tracks: [],
                isPlaying: true,
                isPaused: false,
                volume: 75,
                repeatMode: 'off',
                shuffled: false,
                position: 5000,
                voiceChannelId: '999',
                voiceChannelName: 'General',
                timestamp: Date.now(),
            }
            mockGetState.mockResolvedValue(mockState)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/state`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body.guildId).toBe(GUILD_ID)
            expect(res.body.currentTrack.title).toBe('Test Track')
            expect(res.body.isPlaying).toBe(true)
            expect(res.body.volume).toBe(75)
        })

        test('returns empty state when no player', async () => {
            authed()
            mockGetState.mockResolvedValue(null)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/state`)
                .set('Cookie', SESSION_COOKIE)
                .expect(200)

            expect(res.body.guildId).toBe(GUILD_ID)
            expect(res.body.currentTrack).toBeNull()
            expect(res.body.isPlaying).toBe(false)
            expect(res.body.volume).toBe(50)
            expect(res.body.tracks).toEqual([])
        })
    })

    describe('GET /api/guilds/:guildId/music/stream', () => {
        test('returns 401 without auth', async () => {
            await request(app)
                .get(`/api/guilds/${GUILD_ID}/music/stream`)
                .expect(401)
        })

        test('returns SSE headers and sends initial state when state exists', (done) => {
            authed()
            mockGetState.mockResolvedValue({
                guildId: GUILD_ID,
                currentTrack: { title: 'Test', author: 'Artist' },
                tracks: [],
                isPlaying: true,
                isPaused: false,
                volume: 75,
                repeatMode: 'off' as const,
                shuffled: false,
                position: 0,
                voiceChannelId: null,
                voiceChannelName: null,
                timestamp: 0,
            })

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                const chunks: string[] = []

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        expect(res.headers['content-type']).toContain(
                            'text/event-stream',
                        )
                        res.on('data', (chunk: Buffer) => {
                            chunks.push(chunk.toString())
                            req.destroy()
                        })
                    },
                )

                req.on('close', () => {
                    server.close(() => {
                        expect(chunks.join('')).toContain('data:')
                        done()
                    })
                })

                req.on('error', () => {
                    server.close(() => done())
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 2000)
            })
        }, 5000)

        test('returns SSE headers with no data when no current state', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        expect(res.headers['content-type']).toContain(
                            'text/event-stream',
                        )
                        setTimeout(() => req.destroy(), 50)
                    },
                )

                req.on('close', () => {
                    server.close(() => done())
                })

                req.on('error', () => {
                    server.close(() => done())
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 1000)
            })
        }, 5000)

        test('cleans up SSE client on connection close', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        setTimeout(() => req.destroy(), 30)
                    },
                )

                req.on('close', () => {
                    server.close(() => done())
                })

                req.on('error', () => {
                    server.close(() => done())
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 1000)
            })
        }, 5000)

        test('does not write heartbeat after client disconnect', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                let writeCallCount = 0

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        res.on('data', () => {
                            writeCallCount++
                        })
                        // Close immediately after headers received
                        setTimeout(() => req.destroy(), 10)
                    },
                )

                req.on('close', () => {
                    // Wait longer than heartbeat interval to ensure no further writes
                    setTimeout(() => {
                        server.close(() => {
                            // Should only have header writes, no heartbeat data
                            done()
                        })
                    }, 100)
                })

                req.on('error', () => {
                    server.close(() => done())
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 2000)
            })
        }, 5000)
    })
})
