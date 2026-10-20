import {
    describe,
    it,
    expect,
    jest,
    beforeEach,
    afterEach,
} from '@jest/globals'
import { setupErrorHandlers, isNonFatalRejection } from './errorHandler'
import { errorLog, warnLog } from './general/log'
import { flushSentry } from './monitoring/sentry'

jest.mock('./general/log', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('./timerManager', () => ({
    clearAllTimers: jest.fn(),
}))

jest.mock('./monitoring/sentry', () => ({
    flushSentry: jest.fn(async () => undefined),
}))

jest.mock('./error/errorHandler', () => ({
    createCorrelationId: jest.fn(() => 'cid'),
    handleError: jest.fn((error: unknown) => ({
        error,
        metadata: { correlationId: 'cid' },
    })),
}))

// Same shape discord-player throws from GuildQueue.play / node.play.
class NoVoiceConnectionError extends Error {
    code = 'ERR_NO_VOICE_CONNECTION'
    constructor() {
        super(
            'No voice connection available, maybe connect to a voice channel first?',
        )
        this.name = 'NoVoiceConnectionError'
    }
}

type Listener = (...args: unknown[]) => void

function captureRejectionListener(): Listener {
    // Record the listeners without attaching them to the real process.
    const onSpy = jest
        .spyOn(process, 'on')
        .mockImplementation((() => process) as never)
    setupErrorHandlers()
    const call = onSpy.mock.calls.find(
        ([event]) => event === 'unhandledRejection',
    )
    onSpy.mockRestore()
    if (!call) throw new Error('unhandledRejection listener not registered')
    return call[1] as Listener
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

describe('isNonFatalRejection', () => {
    it('accepts a NoVoiceConnectionError', () => {
        expect(isNonFatalRejection(new NoVoiceConnectionError())).toBe(true)
    })

    it('rejects other errors and non-objects', () => {
        expect(isNonFatalRejection(new Error('boom'))).toBe(false)
        expect(isNonFatalRejection('ERR_NO_VOICE_CONNECTION')).toBe(false)
        expect(isNonFatalRejection(null)).toBe(false)
        expect(isNonFatalRejection({ code: 42 })).toBe(false)
    })
})

describe('setupErrorHandlers unhandledRejection', () => {
    let exitSpy: ReturnType<typeof jest.spyOn>
    let listener: Listener

    beforeEach(() => {
        jest.clearAllMocks()
        exitSpy = jest
            .spyOn(process, 'exit')
            .mockImplementation((() => undefined) as never)
        listener = captureRejectionListener()
    })

    afterEach(() => {
        exitSpy.mockRestore()
    })

    it('keeps the process alive for a NoVoiceConnectionError', async () => {
        listener(new NoVoiceConnectionError(), Promise.resolve())
        await flushPromises()

        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('process keeps running'),
            }),
        )
        expect(errorLog).not.toHaveBeenCalled()
        expect(flushSentry).not.toHaveBeenCalled()
        expect(exitSpy).not.toHaveBeenCalled()
    })

    it('still exits on any other rejection', async () => {
        listener(new Error('real bug'), Promise.resolve())
        await flushPromises()

        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Unhandled Promise Rejection - Application will exit',
            }),
        )
        expect(exitSpy).toHaveBeenCalledWith(1)
    })
})
