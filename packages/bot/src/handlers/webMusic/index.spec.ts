const connect = jest.fn(async () => undefined)
const subscribeToCommands = jest.fn(async () => undefined)
const publishState = jest.fn(async () => undefined)
const sendResult = jest.fn(async () => undefined)
const buildQueueStateMock = jest.fn(async () => ({
    isPlaying: false,
    tracks: [],
}))
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const debugLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        connect: (...a: Parameters<typeof connect>) => connect(...a),
        subscribeToCommands: (...a: Parameters<typeof subscribeToCommands>) =>
            subscribeToCommands(...a),
        publishState: (...a: Parameters<typeof publishState>) =>
            publishState(...a),
        sendResult: (...a: Parameters<typeof sendResult>) => sendResult(...a),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...a: unknown[]) => infoLogMock(...a),
    errorLog: (...a: unknown[]) => errorLogMock(...a),
    debugLog: (...a: unknown[]) => debugLogMock(...a),
    warnLog: (...a: unknown[]) => warnLogMock(...a),
}))
jest.mock('./mappers', () => ({
    buildQueueState: (...a: Parameters<typeof buildQueueStateMock>) =>
        buildQueueStateMock(...a),
}))
jest.mock('./commandHandlers', () => ({}))
jest.mock('./queueHandlers', () => ({}))

import { setupWebMusicHandler } from './index'

type FinishHandler = (q: { guild: { id: string } }) => unknown

function makeClient() {
    const handlers: Record<string, FinishHandler> = {}
    const client = {
        player: {
            events: {
                on: (ev: string, h: FinishHandler) => {
                    handlers[ev] = h
                },
            },
            nodes: { cache: new Map() },
        },
    } as unknown as Parameters<typeof setupWebMusicHandler>[0]
    return { client, handlers }
}

describe('setupWebMusicHandler — playerFinish', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })
    afterEach(() => {
        jest.useRealTimers()
    })

    it('publishes queue state 500ms after playerFinish', async () => {
        const { client, handlers } = makeClient()
        await setupWebMusicHandler(client)

        await handlers.playerFinish({ guild: { id: 'g1' } })
        await jest.advanceTimersByTimeAsync(500)

        expect(buildQueueStateMock).toHaveBeenCalledWith(client, 'g1')
        expect(publishState).toHaveBeenCalled()
        expect(errorLogMock).not.toHaveBeenCalled()
    })

    it('logs (does not throw) when publishing after playerFinish rejects', async () => {
        const { client, handlers } = makeClient()
        await setupWebMusicHandler(client)
        buildQueueStateMock.mockRejectedValueOnce(new Error('boom'))

        await handlers.playerFinish({ guild: { id: 'g1' } })
        await jest.advanceTimersByTimeAsync(500)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error publishing queue state after playerFinish:',
            }),
        )
    })
})

describe('setupWebMusicHandler — periodic publish (#2160)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })
    afterEach(() => {
        jest.useRealTimers()
    })

    it('warns (visible in prod) when the 30s periodic publish tick fails', async () => {
        const { client } = makeClient()
        client.player.nodes.cache.set('g1', {
            guild: { id: 'g1' } as never,
        } as never)
        buildQueueStateMock.mockRejectedValueOnce(new Error('boom'))
        await setupWebMusicHandler(client)

        await jest.advanceTimersByTimeAsync(30000)

        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Error during periodic state publish',
                data: expect.objectContaining({ guildId: 'g1' }),
            }),
        )
    })
})
