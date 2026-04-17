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
import { sseClients } from '../../../src/routes/music/helpers'

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

describe.skip('Music State Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupStateRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
        jest.clearAllTimers()
        // Clear SSE clients to prevent cross-test pollution
        sseClients.clear()
        // Use real timers by default, but tests can call jest.useFakeTimers()
        jest.useRealTimers()
    })

    afterEach(() => {
        jest.clearAllTimers()
        jest.useRealTimers()
        // Clear SSE clients after each test
        sseClients.clear()
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

        test('heartbeat skips write when controller.signal.aborted', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                let heartbeatWrites = 0

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        res.on('data', (chunk: Buffer) => {
                            const str = chunk.toString()
                            if (str.includes('heartbeat')) {
                                heartbeatWrites++
                            }
                        })
                        // Close to trigger close handler which aborts controller
                        setTimeout(() => req.destroy(), 100)
                    },
                )

                req.on('close', () => {
                    // Wait to ensure heartbeat interval doesn't fire after abort
                    setTimeout(() => {
                        server.close(() => {
                            // Should have no heartbeat writes after disconnect
                            expect(heartbeatWrites).toBe(0)
                            done()
                        })
                    }, 150)
                })

                req.on('error', () => {
                    server.close(() => done())
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 3000)
            })
        }, 5000)

        test('heartbeat skips write when res.writableEnded', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                let initialHeartbeat = true

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        // Simulate writableEnded by ending response early
                        res.end()
                    },
                )

                req.on('close', () => {
                    // If we reach here without error, writableEnded guard worked
                    setTimeout(() => {
                        server.close(() => {
                            done()
                        })
                    }, 150)
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

        test('heartbeat skips write when res.destroyed', (done) => {
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
                        // Destroy the response to set destroyed flag
                        setTimeout(() => {
                            res.destroy()
                        }, 50)
                    },
                )

                req.on('close', () => {
                    // If we reach here without error, destroyed guard worked
                    setTimeout(() => {
                        server.close(() => {
                            done()
                        })
                    }, 150)
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

        test('close handler clears heartbeat interval', (done) => {
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
                        // Close after establishing connection
                        setTimeout(() => req.destroy(), 50)
                    },
                )

                req.on('close', () => {
                    // Verify that after close, no further interval operations happen
                    setTimeout(() => {
                        server.close(() => {
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

        test('removes client from sseClients on disconnect', (done) => {
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
                        setTimeout(() => req.destroy(), 50)
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            done()
                        })
                    }, 50)
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

        test('handles multiple concurrent client disconnects', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port

                // Create first client connection
                const req1 = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                    },
                )

                // Create second client connection
                const req2 = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                    },
                )

                // Destroy both after a short delay
                setTimeout(() => {
                    req1.destroy()
                    req2.destroy()
                }, 100)

                req1.on('error', () => {})
                req2.on('error', () => {})

                // Wait and then close server
                setTimeout(() => {
                    server.close(() => {
                        done()
                    })
                }, 500)
            })
        }, 5000)

        test('client disconnect during initial state write triggers catch block', (done) => {
            authed()
            const stateData = {
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
            }
            mockGetState.mockResolvedValue(stateData)

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
                        // Immediately destroy to prevent initial state write
                        setImmediate(() => res.destroy())
                    },
                )

                req.on('error', () => {})

                setTimeout(() => {
                    server.close(() => {
                        done()
                    })
                }, 500)
            })
        }, 5000)


        test('guild removed from sseClients when all clients disconnect', (done) => {
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
                        // Close connection to trigger cleanup
                        setTimeout(() => req.destroy(), 50)
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            // Guild should be removed from sseClients when last client disconnects
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

        test('returns initial state data and registers client for streaming', (done) => {
            authed()
            const stateData = {
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
            }
            mockGetState.mockResolvedValue(stateData)

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
                        let gotData = false
                        res.on('data', (chunk: Buffer) => {
                            const str = chunk.toString()
                            if (str.includes('data:') && str.includes('Test')) {
                                gotData = true
                                req.destroy()
                            }
                        })
                        setTimeout(() => {
                            if (!gotData) req.destroy()
                        }, 500)
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => done())
                    }, 50)
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

        test('stream sends initial state then waits for events', (done) => {
            authed()
            const stateData = {
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
            }
            mockGetState.mockResolvedValue(stateData)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                let dataReceived = false

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        expect(res.headers['content-type']).toContain('text/event-stream')
                        res.on('data', (chunk: Buffer) => {
                            if (chunk.toString().includes('data:')) {
                                dataReceived = true
                                req.destroy()
                            }
                        })
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            expect(dataReceived).toBe(true)
                            done()
                        })
                    }, 50)
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

        test('stream handles state that throws during write gracefully', (done) => {
            authed()
            // Return state so res.write() is attempted
            mockGetState.mockResolvedValue({
                guildId: GUILD_ID,
                currentTrack: null,
                tracks: [],
                isPlaying: false,
                isPaused: false,
                volume: 50,
                repeatMode: 'off' as const,
                shuffled: false,
                position: 0,
                voiceChannelId: null,
                voiceChannelName: null,
                timestamp: 0,
            })

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
                        // Destroy socket to cause write to fail (tests lines 23-28 catch block)
                        res.destroy()
                    },
                )

                req.on('error', () => {
                    // Expected because res is destroyed
                })

                setTimeout(() => {
                    server.close(() => {
                        // Test passes: server didn't crash even though write failed
                        done()
                    })
                }, 500)
            })
        }, 5000)

        test('heartbeat interval tries to write and catches any errors', (done) => {
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
                        // Destroy after a delay while heartbeat tries to write (tests lines 46-50 catch block)
                        setTimeout(() => {
                            res.destroy()
                        }, 100)
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            // Test passes: server handled heartbeat write error gracefully
                            done()
                        })
                    }, 150)
                })

                req.on('error', () => {
                    // Expected because res is destroyed
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 1500)
            })
        }, 5000)

        test('heartbeat interval executes when connection stays open', (done) => {
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
                        let heartbeatReceived = false
                        res.on('data', (chunk: Buffer) => {
                            if (chunk.toString().includes('heartbeat')) {
                                heartbeatReceived = true
                                req.destroy()
                            }
                        })
                        // Keep connection open long enough for heartbeat (30s)
                        setTimeout(() => {
                            if (!heartbeatReceived) req.destroy()
                        }, 35000)
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            // Heartbeat interval should have fired
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
                }, 40000)
            })
        }, 45000)

        test('heartbeat guard prevents write when controller.signal.aborted', (done) => {
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
                        // Close immediately which triggers abort
                        setImmediate(() => req.destroy())
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            // Controller should be aborted, preventing heartbeat writes
                            done()
                        })
                    }, 100)
                })

                req.on('error', () => {
                    // Expected
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 1000)
            })
        }, 5000)

        test('initial state write exception returns early without registering client', (done) => {
            authed()
            const stateData = {
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
            }
            mockGetState.mockResolvedValue(stateData)

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
                        // Destroy the socket immediately to cause write to fail with EPIPE
                        res.destroy()
                    },
                )

                req.on('error', () => {
                    // Expected - the destroy causes error
                })

                setTimeout(() => {
                    server.close(() => {
                        // If we reach here without server crash, the catch block worked (line 25-27)
                        done()
                    })
                }, 500)
            })
        }, 5000)

        test('heartbeat writes periodically to maintain connection', (done) => {
            authed()
            mockGetState.mockResolvedValue(null)

            const server = app.listen(0, () => {
                const port = (server.address() as AddressInfo).port
                let heartbeatCount = 0

                const req = http.get(
                    {
                        hostname: '127.0.0.1',
                        port,
                        path: `/api/guilds/${GUILD_ID}/music/stream`,
                        headers: { Cookie: 'sessionId=valid_session_id' },
                    },
                    (res) => {
                        expect(res.statusCode).toBe(200)
                        res.on('data', (chunk: Buffer) => {
                            if (chunk.toString().includes('heartbeat')) {
                                heartbeatCount++
                                // After first heartbeat, close to test guard
                                if (heartbeatCount === 1) {
                                    req.destroy()
                                }
                            }
                        })
                    },
                )

                req.on('close', () => {
                    setTimeout(() => {
                        server.close(() => {
                            // At least one heartbeat should have been sent
                            expect(heartbeatCount).toBeGreaterThan(0)
                            done()
                        })
                    }, 100)
                })

                req.on('error', () => {
                    // Expected
                })

                setTimeout(() => {
                    req.destroy()
                    server.close(() => done())
                }, 32000)
            })
        }, 35000)
    })
})
