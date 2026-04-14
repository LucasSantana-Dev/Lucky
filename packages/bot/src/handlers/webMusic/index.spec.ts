import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals'
import { setupWebMusicHandler } from './index'

const connectMock = jest.fn()
const subscribeMock = jest.fn()
const publishStateMock = jest.fn()
const buildQueueStateMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()
const debugLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        connect: (...args: unknown[]) => connectMock(...args),
        subscribeToCommands: (...args: unknown[]) => subscribeMock(...args),
        sendResult: jest.fn(),
        publishState: (...args: unknown[]) => publishStateMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('./mappers', () => ({
    buildQueueState: (...args: unknown[]) => buildQueueStateMock(...args),
}))

function makeClient(queues: unknown[] = []) {
    const eventsHandlers: Record<string, (...args: unknown[]) => void> = {}
    return {
        player: {
            events: {
                on: (event: string, handler: (...args: unknown[]) => void) => {
                    eventsHandlers[event] = handler
                },
            },
            nodes: {
                cache: {
                    values: () => queues[Symbol.iterator](),
                },
            },
        },
        _eventsHandlers: eventsHandlers,
    }
}

describe('setupWebMusicHandler', () => {
    beforeEach(() => {
        jest.useFakeTimers()
        connectMock.mockResolvedValue(undefined)
        subscribeMock.mockResolvedValue(undefined)
        publishStateMock.mockResolvedValue(undefined)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('connects and subscribes on setup', async () => {
        const client = makeClient()
        await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])
        expect(connectMock).toHaveBeenCalledTimes(1)
        expect(subscribeMock).toHaveBeenCalledTimes(1)
        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Web music handler initialized' }),
        )
    })

    it('logs error when connect fails', async () => {
        connectMock.mockRejectedValue(new Error('Redis down'))
        const client = makeClient()
        await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Failed to setup web music handler:' }),
        )
    })

    describe('periodic state publish (setInterval)', () => {
        it('publishes state for active queues on interval tick', async () => {
            const activeQueue = { guild: { id: 'guild-1' } }
            const client = makeClient([activeQueue])
            buildQueueStateMock.mockResolvedValue({
                guildId: 'guild-1',
                isPlaying: true,
                tracks: [],
            })

            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(buildQueueStateMock).toHaveBeenCalledWith(
                expect.anything(),
                'guild-1',
            )
            expect(publishStateMock).toHaveBeenCalledWith(
                expect.objectContaining({ guildId: 'guild-1', isPlaying: true }),
            )
        })

        it('publishes state when queue has tracks even if not playing', async () => {
            const queue = { guild: { id: 'guild-2' } }
            const client = makeClient([queue])
            buildQueueStateMock.mockResolvedValue({
                guildId: 'guild-2',
                isPlaying: false,
                tracks: [{ title: 'Song 1' }],
            })

            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(publishStateMock).toHaveBeenCalledWith(
                expect.objectContaining({ guildId: 'guild-2' }),
            )
        })

        it('skips publishing for idle queues (not playing, no tracks)', async () => {
            const queue = { guild: { id: 'guild-3' } }
            const client = makeClient([queue])
            buildQueueStateMock.mockResolvedValue({
                guildId: 'guild-3',
                isPlaying: false,
                tracks: [],
            })

            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(buildQueueStateMock).toHaveBeenCalled()
            expect(publishStateMock).not.toHaveBeenCalled()
        })

        it('skips null queue entries', async () => {
            const client = makeClient([null])
            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(buildQueueStateMock).not.toHaveBeenCalled()
        })

        it('logs error and continues when buildQueueState throws', async () => {
            const queue = { guild: { id: 'guild-err' } }
            const client = makeClient([queue])
            buildQueueStateMock.mockRejectedValue(new Error('state build failed'))

            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Error during periodic state publish' }),
            )
            expect(publishStateMock).not.toHaveBeenCalled()
        })

        it('logs non-Error throws as string', async () => {
            const queue = { guild: { id: 'guild-err2' } }
            const client = makeClient([queue])
            buildQueueStateMock.mockRejectedValue('string error')

            await setupWebMusicHandler(client as unknown as Parameters<typeof setupWebMusicHandler>[0])

            await jest.advanceTimersByTimeAsync(30000)

            expect(debugLogMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ error: 'string error' }),
                }),
            )
        })
    })
})
