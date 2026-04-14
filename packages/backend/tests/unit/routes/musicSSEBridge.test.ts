import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import type { Response } from 'express'

const connectMock = jest.fn()
const subscribeToResultsMock = jest.fn()
const subscribeToStateMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

// sseClients is a module-level Map — we control it via the helper module mock
const mockSseClients = new Map<string, Set<Response>>()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        connect: (...args: unknown[]) => connectMock(...args),
        subscribeToResults: (...args: unknown[]) => subscribeToResultsMock(...args),
        subscribeToState: (...args: unknown[]) => subscribeToStateMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../src/routes/music/helpers', () => ({
    sseClients: mockSseClients,
}))

// Route setup stubs (we only care about the SSE bridge behavior)
jest.mock('../../../src/routes/music/playbackRoutes', () => ({ setupPlaybackRoutes: jest.fn() }))
jest.mock('../../../src/routes/music/queueRoutes', () => ({ setupQueueRoutes: jest.fn() }))
jest.mock('../../../src/routes/music/stateRoutes', () => ({ setupStateRoutes: jest.fn() }))

describe('music SSE bridge (initMusicSSEBridge)', () => {
    beforeEach(() => {
        mockSseClients.clear()
        connectMock.mockResolvedValue(undefined)
        subscribeToResultsMock.mockResolvedValue(undefined)
        subscribeToStateMock.mockResolvedValue(undefined)
    })

    async function initBridge() {
        jest.resetModules()
        connectMock.mockResolvedValue(undefined)
        subscribeToResultsMock.mockResolvedValue(undefined)
        subscribeToStateMock.mockResolvedValue(undefined)

        const { setupMusicRoutes } = await import('../../../src/routes/music/index')
        setupMusicRoutes({} as never)
        // Let the async initMusicSSEBridge settle
        await new Promise((r) => setTimeout(r, 10))
    }

    test('calls connect, subscribeToResults, and subscribeToState in order', async () => {
        await initBridge()
        expect(connectMock).toHaveBeenCalledTimes(1)
        expect(subscribeToResultsMock).toHaveBeenCalledTimes(1)
        expect(subscribeToStateMock).toHaveBeenCalledTimes(1)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Music SSE bridge initialized successfully' }),
        )
    })

    test('logs error and stops when connect throws', async () => {
        connectMock.mockRejectedValue(new Error('Redis unavailable'))
        jest.resetModules()
        const { setupMusicRoutes } = await import('../../../src/routes/music/index')
        setupMusicRoutes({} as never)
        await new Promise((r) => setTimeout(r, 10))
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Failed to initialize music SSE bridge:' }),
        )
        expect(subscribeToResultsMock).not.toHaveBeenCalled()
    })

    describe('subscribeToState callback', () => {
        async function getStateCallback() {
            await initBridge()
            return subscribeToStateMock.mock.calls[0][0] as (state: unknown) => void
        }

        test('does nothing when no clients registered for guild', async () => {
            const cb = await getStateCallback()
            cb({ guildId: 'guild-1', isPlaying: true, tracks: [] })
            expect(infoLogMock).not.toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('broadcast') }),
            )
        })

        test('writes state to registered SSE clients', async () => {
            const writeMock = jest.fn()
            const mockClient = { write: (...args: unknown[]) => writeMock(...args) } as unknown as Response
            mockSseClients.set('guild-2', new Set([mockClient]))

            const cb = await getStateCallback()
            const state = { guildId: 'guild-2', isPlaying: true, tracks: [] }
            cb(state)

            expect(writeMock).toHaveBeenCalledWith(
                expect.stringContaining(`"guildId":"guild-2"`),
            )
            expect(infoLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Music state broadcast to 1 clients'),
                }),
            )
        })

        test('logs error when write throws and continues', async () => {
            const failingClient = {
                write: jest.fn(() => { throw new Error('socket closed') }),
            } as unknown as Response
            const goodWrite = jest.fn()
            const goodClient = { write: (...args: unknown[]) => goodWrite(...args) } as unknown as Response
            mockSseClients.set('guild-3', new Set([failingClient, goodClient]))

            const cb = await getStateCallback()
            cb({ guildId: 'guild-3', isPlaying: false, tracks: [] })

            expect(errorLogMock).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Failed to write to SSE client' }),
            )
            expect(goodWrite).toHaveBeenCalled()
        })
    })
})
