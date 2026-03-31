import { execFile } from 'child_process'

const mockSpawn = jest.fn()

jest.mock('discord-player', () => {
    const loadMulti = jest.fn().mockResolvedValue(undefined)
    const register = jest.fn().mockResolvedValue(undefined)
    const MockPlayer = jest.fn().mockImplementation(function (this: any) {
        this.extractors = { loadMulti, register }
        this.setMaxListeners = jest.fn()
        this.events = {
            on: jest.fn(),
            removeAllListeners: jest.fn(),
        }
    })
    return { Player: MockPlayer }
})

jest.mock('@discord-player/extractor', () => ({
    DefaultExtractors: [],
}))

jest.mock('discord-player-youtubei', () => ({
    YoutubeiExtractor: class MockYoutubeiExtractor {},
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('child_process', () => ({
    execFile: jest.fn(),
    spawn: (...args: unknown[]) => mockSpawn(...args),
}))

jest.mock('util', () => ({
    ...jest.requireActual('util'),
    promisify: jest.fn((fn: any) => {
        return (...args: any[]) =>
            new Promise((resolve, reject) => {
                fn(...args, (err: any, result: any) => {
                    if (err) reject(err)
                    else resolve(result)
                })
            })
    }),
}))

const mockExecFile = execFile as unknown as jest.MockedFunction<typeof execFile>

function createSpawnProcessMock(
    opts: { fireClose?: number; fireData?: boolean } = {},
) {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
    const stdoutListeners: Record<string, ((...args: unknown[]) => void)[]> = {}

    const proc = {
        stdout: {
            on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                stdoutListeners[event] = stdoutListeners[event] ?? []
                stdoutListeners[event].push(cb)
            }),
            once: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
                stdoutListeners[event] = stdoutListeners[event] ?? []
                stdoutListeners[event].push(cb)
                if (opts.fireData && event === 'data') {
                    Promise.resolve().then(() => cb(Buffer.from('audio')))
                }
            }),
            destroy: jest.fn(),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
            listeners[event] = listeners[event] ?? []
            listeners[event].push(cb)
            if (opts.fireClose !== undefined && event === 'close') {
                Promise.resolve().then(() => cb(opts.fireClose))
            }
        }),
        kill: jest.fn(),
    }

    return proc
}

describe('playerFactory', () => {
    beforeEach(() => {
        jest.resetModules()
        mockSpawn.mockReset()
        mockSpawn.mockImplementation((_cmd: unknown, args: string[]) => {
            if (Array.isArray(args) && args[0] === '--version') {
                return createSpawnProcessMock({ fireClose: 0 })
            }
            return createSpawnProcessMock({ fireData: true })
        })
    })

    describe('module exports', () => {
        it('exports createPlayer function', async () => {
            const mod =
                await import('../../../src/handlers/player/playerFactory')
            expect(mod.createPlayer).toBeDefined()
        })
    })

    describe('createPlayer', () => {
        it('creates a Player instance', async () => {
            const { Player } = await import('discord-player')
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')
            const mockClient = { user: { id: '123' } } as any

            const player = createPlayer({ client: mockClient })
            expect(player).toBeDefined()
            expect(Player).toHaveBeenCalledWith(mockClient)
        })
    })

    describe('yt-dlp URL resolution', () => {
        it('uses execFile with --get-url for YouTube URLs', () => {
            const url = 'https://youtube.com/watch?v=abc123'
            const streamUrl =
                'https://rr3---sn.googlevideo.com/videoplayback?...'

            mockExecFile.mockImplementation(
                (_cmd: any, _args: any, _opts: any, cb: any) => {
                    cb(null, { stdout: streamUrl + '\n', stderr: '' })
                    return {} as any
                },
            )

            execFile(
                'yt-dlp',
                ['-f', 'bestaudio', '--get-url', '--no-warnings', url],
                { timeout: 30000 },
                (err, result) => {
                    expect(err).toBeNull()
                    expect((result as any).stdout.trim()).toBe(streamUrl)
                },
            )

            expect(mockExecFile).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining(['-f', 'bestaudio', '--get-url', url]),
                expect.objectContaining({ timeout: 30000 }),
                expect.any(Function),
            )
        })

        it('uses resilient yt-dlp format fallback for YouTube streams', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as {
                extractors: { register: jest.Mock }
            }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            expect(player.extractors.register).toHaveBeenCalled()

            const extractorOptions = player.extractors.register.mock
                .calls[0][1] as {
                createStream: (_track: unknown) => Promise<unknown>
            }

            await extractorOptions.createStream({
                url: 'https://youtube.com/watch?v=abc123',
            })

            expect(mockSpawn).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining([
                    '-f',
                    'bestaudio/best',
                    '-o',
                    '-',
                    '--no-warnings',
                    '--quiet',
                    'https://youtube.com/watch?v=abc123',
                ]),
                expect.objectContaining({
                    stdio: ['ignore', 'pipe', 'pipe'],
                }),
            )
        })
    })
})
