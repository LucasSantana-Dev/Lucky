import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { YtDlpExtractorService } from '../../../src/utils/music/ytdlpExtractor/service'

jest.mock('child_process')
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))
jest.mock('discord-player', () => ({
    BaseExtractor: class MockBase {
        constructor() {}
    },
}))

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>

function createMockProcess() {
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = jest.fn()
    proc.pid = 99999
    return proc
}

describe('YtDlpExtractorService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('validate', () => {
        it('validates YouTube URLs', async () => {
            const extractor = new YtDlpExtractorService({} as any, {})

            expect(
                await extractor.validate('https://youtube.com/watch?v=abc'),
            ).toBe(true)
            expect(await extractor.validate('https://youtu.be/abc')).toBe(true)
            expect(
                await extractor.validate(
                    'https://youtube.com/playlist?list=PLxyz',
                ),
            ).toBe(true)
        })
    })

    describe('retry behavior', () => {
        async function flushMicrotasks(n = 4) {
            for (let i = 0; i < n; i++) await Promise.resolve()
        }

        it('returns tracks on the first successful attempt', async () => {
            const proc = createMockProcess()
            mockSpawn.mockReturnValue(proc as any)

            const extractor = new YtDlpExtractorService({} as any, { timeout: 30000 })
            const handlePromise = extractor.handle('https://youtube.com/watch?v=test', {} as any)

            proc.emit('close', 0)

            const result = await handlePromise
            expect(result.tracks).toEqual([])
            expect(mockSpawn).toHaveBeenCalledTimes(1)
        })

        it('retries after first failure and succeeds on second attempt', async () => {
            const proc1 = createMockProcess()
            const proc2 = createMockProcess()
            mockSpawn.mockReturnValueOnce(proc1 as any).mockReturnValueOnce(proc2 as any)

            const extractor = new YtDlpExtractorService({} as any, { timeout: 30000 })
            const handlePromise = extractor.handle('https://youtube.com/watch?v=test', {} as any)

            proc1.emit('close', 1)
            await flushMicrotasks()

            proc2.emit('close', 0)

            const result = await handlePromise
            expect(result.tracks).toEqual([])
            expect(mockSpawn).toHaveBeenCalledTimes(2)
        })

        it('throws after all three attempts fail', async () => {
            const procs = [createMockProcess(), createMockProcess(), createMockProcess()]
            procs.forEach((p) => mockSpawn.mockReturnValueOnce(p as any))

            const extractor = new YtDlpExtractorService({} as any, { timeout: 30000 })
            const handlePromise = extractor.handle('https://youtube.com/watch?v=test', {} as any)

            procs[0].emit('close', 1)
            await flushMicrotasks()
            procs[1].emit('close', 1)
            await flushMicrotasks()
            procs[2].emit('close', 1)

            await expect(handlePromise).rejects.toThrow()
            expect(mockSpawn).toHaveBeenCalledTimes(3)
        })

        it('kills the process and retries on timeout', async () => {
            const proc1 = createMockProcess()
            const proc2 = createMockProcess()
            mockSpawn.mockReturnValueOnce(proc1 as any).mockReturnValueOnce(proc2 as any)

            const extractor = new YtDlpExtractorService({} as any, { timeout: 1000 })
            const handlePromise = extractor.handle('https://youtube.com/watch?v=test', {} as any)

            jest.advanceTimersByTime(1000)
            await flushMicrotasks()

            expect(proc1.kill).toHaveBeenCalled()

            proc2.emit('close', 0)

            const result = await handlePromise
            expect(result.tracks).toEqual([])
            expect(mockSpawn).toHaveBeenCalledTimes(2)
        })
    })

    describe('yt-dlp process integration', () => {
        it('spawns yt-dlp with bestaudio format', () => {
            const proc = createMockProcess()
            mockSpawn.mockReturnValue(proc as any)

            spawn('yt-dlp', [
                '-f',
                'bestaudio',
                '-o',
                '-',
                '--no-warnings',
                '--quiet',
                'https://youtube.com/watch?v=test',
            ])

            expect(mockSpawn).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining(['-f', 'bestaudio']),
            )
        })

        it('captures stderr output', () => {
            const proc = createMockProcess()
            mockSpawn.mockReturnValue(proc as any)

            const stderrData: string[] = []
            proc.stderr.on('data', (data: Buffer) => {
                stderrData.push(data.toString())
            })

            proc.stderr.emit('data', Buffer.from('warning message'))
            expect(stderrData).toContain('warning message')
        })

        it('handles process errors', () => {
            const proc = createMockProcess()
            mockSpawn.mockReturnValue(proc as any)

            const errors: Error[] = []
            proc.on('error', (err: Error) => {
                errors.push(err)
            })

            proc.emit('error', new Error('yt-dlp not found'))
            expect(errors).toHaveLength(1)
            expect(errors[0].message).toBe('yt-dlp not found')
        })

        it('produces readable stdout stream', () => {
            const stdout = new Readable({
                read() {
                    this.push(Buffer.from('opus audio bytes'))
                    this.push(null)
                },
            })

            const chunks: Buffer[] = []
            stdout.on('data', (chunk) => chunks.push(chunk))
            stdout.on('end', () => {
                expect(Buffer.concat(chunks).toString()).toBe(
                    'opus audio bytes',
                )
            })
        })
    })
})
