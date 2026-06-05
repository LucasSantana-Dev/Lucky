import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

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

jest.mock('@lucky/shared/services', () => ({
    musicControlService: {
        connect: (...a: unknown[]) => connect(...a),
        subscribeToCommands: (...a: unknown[]) => subscribeToCommands(...a),
        publishState: (...a: unknown[]) => publishState(...a),
        sendResult: (...a: unknown[]) => sendResult(...a),
    },
}))
jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...a: unknown[]) => infoLogMock(...a),
    errorLog: (...a: unknown[]) => errorLogMock(...a),
    debugLog: (...a: unknown[]) => debugLogMock(...a),
}))
jest.mock('./mappers', () => ({
    buildQueueState: (...a: unknown[]) => buildQueueStateMock(...a),
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
