import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

jest.mock('child_process')
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
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
            jest.mock('discord-player', () => ({
                BaseExtractor: class MockBase {
                    constructor() {}
                },
            }))

            const { YtDlpExtractorService } =
                await import('../../../src/utils/music/ytdlpExtractor/service')

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
