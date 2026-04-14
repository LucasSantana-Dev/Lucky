import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('child_process', () => ({
    spawn: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('discord-player', () => ({
    BaseExtractor: class BaseExtractor {
        constructor(
            public context: unknown,
            public options?: unknown,
        ) {}
    },
}))

import { YtDlpExtractorService } from './service'
import { spawn } from 'child_process'

const spawnMock = spawn as jest.MockedFunction<typeof spawn>

function makeProcess(
    overrides: Partial<{
        stdoutData: string | null
        stderrData: string
        exitCode: number | null
        spawnError: Error | null
        delay: number
    }> = {},
) {
    const opts = {
        stdoutData: '{}',
        stderrData: '',
        exitCode: 0,
        spawnError: null,
        delay: 0,
        ...overrides,
    }

    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
    const stdoutListeners: Record<string, ((...args: unknown[]) => void)[]> = {}
    const stderrListeners: Record<string, ((...args: unknown[]) => void)[]> = {}

    const proc = {
        stdout: {
            on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                stdoutListeners[event] = stdoutListeners[event] ?? []
                stdoutListeners[event].push(cb)
            }),
        },
        stderr: {
            on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                stderrListeners[event] = stderrListeners[event] ?? []
                stderrListeners[event].push(cb)
            }),
        },
        on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
            listeners[event] = listeners[event] ?? []
            listeners[event].push(cb)
        }),
        kill: jest.fn(),
        emit(event: string, ...args: unknown[]) {
            ;(listeners[event] ?? []).forEach((cb) => cb(...args))
        },
        emitStdout(data: string) {
            ;(stdoutListeners['data'] ?? []).forEach((cb) =>
                cb(Buffer.from(data)),
            )
        },
        emitStderr(data: string) {
            ;(stderrListeners['data'] ?? []).forEach((cb) =>
                cb(Buffer.from(data)),
            )
        },
        triggerClose() {
            if (opts.stdoutData !== null) this.emitStdout(opts.stdoutData)
            if (opts.stderrData) this.emitStderr(opts.stderrData)
            this.emit('close', opts.exitCode)
        },
        triggerError(err: Error) {
            this.emit('error', err)
        },
    }

    return proc
}

const fakeContext = { player: null }

describe('YtDlpExtractorService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useRealTimers()
    })

    describe('constructor', () => {
        it('uses default options when none provided', () => {
            const svc = new YtDlpExtractorService(fakeContext as never)
            expect(svc.options.executablePath).toBe('yt-dlp')
            expect(svc.options.outputFormat).toBe('best[height<=720]')
            expect(svc.options.maxDuration).toBe(3600)
            expect(svc.options.timeout).toBe(30000)
        })

        it('merges provided options with defaults', () => {
            const svc = new YtDlpExtractorService(fakeContext as never, {
                executablePath: '/usr/local/bin/yt-dlp',
                timeout: 5000,
            })
            expect(svc.options.executablePath).toBe('/usr/local/bin/yt-dlp')
            expect(svc.options.timeout).toBe(5000)
            expect(svc.options.maxDuration).toBe(3600)
        })
    })

    describe('validate', () => {
        let svc: YtDlpExtractorService

        beforeEach(() => {
            svc = new YtDlpExtractorService(fakeContext as never)
        })

        it('returns true for youtube.com URLs', async () => {
            expect(await svc.validate('https://youtube.com/watch?v=abc')).toBe(
                true,
            )
        })

        it('returns true for youtu.be URLs', async () => {
            expect(await svc.validate('https://youtu.be/abc123')).toBe(true)
        })

        it('returns true for youtube.com/watch URLs', async () => {
            expect(await svc.validate('https://youtube.com/watch?v=test')).toBe(
                true,
            )
        })

        it('returns true for playlist URLs', async () => {
            expect(
                await svc.validate('https://youtube.com/playlist?list=abc'),
            ).toBe(true)
        })

        it('returns true for channel URLs', async () => {
            expect(
                await svc.validate('https://youtube.com/channel/UCabc'),
            ).toBe(true)
        })

        it('returns true for any non-empty string (fallback)', async () => {
            expect(await svc.validate('just a search query')).toBe(true)
        })

        it('returns false for empty string', async () => {
            expect(await svc.validate('')).toBe(false)
        })
    })

    describe('handle', () => {
        let svc: YtDlpExtractorService

        beforeEach(() => {
            svc = new YtDlpExtractorService(fakeContext as never, {
                timeout: 500,
            })
        })

        it('returns tracks on successful yt-dlp exit', async () => {
            const proc = makeProcess({ exitCode: 0, stdoutData: '' })
            spawnMock.mockReturnValue(proc as never)

            const promise = svc.handle(
                'https://youtube.com/watch?v=abc',
                {} as never,
            )
            proc.triggerClose()
            const result = await promise

            expect(result).toHaveProperty('tracks')
            expect(result.playlist).toBeNull()
        })

        it('throws when yt-dlp exits with non-zero code', async () => {
            const proc = makeProcess({
                exitCode: 1,
                stdoutData: null,
                stderrData: 'Video unavailable',
            })
            spawnMock.mockReturnValue(proc as never)

            const promise = svc.handle(
                'https://youtube.com/watch?v=bad',
                {} as never,
            )
            proc.triggerClose()

            await expect(promise).rejects.toThrow()
        })

        it('throws when spawn emits error event', async () => {
            const proc = makeProcess()
            spawnMock.mockReturnValue(proc as never)

            const promise = svc.handle(
                'https://youtube.com/watch?v=err',
                {} as never,
            )
            proc.triggerError(new Error('spawn ENOENT'))

            await expect(promise).rejects.toThrow()
        })

        it('passes the executable path and format to spawn', async () => {
            const proc = makeProcess({ exitCode: 0 })
            spawnMock.mockReturnValue(proc as never)

            const promise = svc.handle(
                'https://youtube.com/watch?v=abc',
                {} as never,
            )
            proc.triggerClose()
            await promise

            expect(spawnMock).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining(['--format', 'best[height<=720]']),
                expect.any(Object),
            )
        })

        it('includes the query as first spawn argument', async () => {
            const proc = makeProcess({ exitCode: 0 })
            spawnMock.mockReturnValue(proc as never)

            const url = 'https://youtube.com/watch?v=xyz'
            const promise = svc.handle(url, {} as never)
            proc.triggerClose()
            await promise

            const args = spawnMock.mock.calls[0]![1] as string[]
            expect(args[0]).toBe(url)
        })
    })

    describe('timeout', () => {
        it('kills the process and resolves with error after timeout', async () => {
            jest.useFakeTimers()

            const proc = makeProcess()
            spawnMock.mockReturnValue(proc as never)

            const svc = new YtDlpExtractorService(fakeContext as never, {
                timeout: 1000,
            })

            const promise = svc.handle(
                'https://youtube.com/watch?v=slow',
                {} as never,
            )
            const assertion = expect(promise).rejects.toThrow()

            jest.advanceTimersByTime(1100)
            await jest.runAllTimersAsync()

            await assertion
            expect(proc.kill).toHaveBeenCalled()
        })
    })
})
