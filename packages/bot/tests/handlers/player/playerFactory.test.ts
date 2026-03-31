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
    spawn: (...args: unknown[]) => mockSpawn(...args),
}))

function createSpawnProcessMock(opts: { fireClose?: number } = {}) {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

    const proc = {
        stdout: { on: jest.fn(), destroy: jest.fn() },
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
            return createSpawnProcessMock()
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

    describe('yt-dlp stream piping', () => {
        it('spawns yt-dlp with pipe args for YouTube URLs', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            expect(player.extractors.register).toHaveBeenCalled()

            const extractorOptions = player.extractors.register.mock
                .calls[0][1] as {
                createStream: (_track: unknown) => Promise<unknown>
            }

            const youtubeUrl = 'https://youtube.com/watch?v=abc123'
            await extractorOptions.createStream({ url: youtubeUrl })

            expect(mockSpawn).toHaveBeenCalledWith(
                'yt-dlp',
                expect.arrayContaining([
                    '-f',
                    'bestaudio/best',
                    '-o',
                    '-',
                    youtubeUrl,
                ]),
                expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
            )
        })

        it('returns proc.stdout as the stream for YouTube URLs', async () => {
            const mockProc = createSpawnProcessMock()
            mockSpawn.mockImplementation((_cmd: unknown, args: string[]) => {
                if (Array.isArray(args) && args[0] === '--version') {
                    return createSpawnProcessMock({ fireClose: 0 })
                }
                return mockProc
            })

            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const extractorOptions = player.extractors.register.mock
                .calls[0][1] as {
                createStream: (_track: unknown) => Promise<unknown>
            }

            const result = await extractorOptions.createStream({
                url: 'https://youtube.com/watch?v=abc123',
            })

            expect(result).toBe(mockProc.stdout)
        })

        it('returns non-YouTube URLs without spawning yt-dlp', async () => {
            const { createPlayer } =
                await import('../../../src/handlers/player/playerFactory')

            const player = createPlayer({
                client: { user: { id: '123' } } as any,
            }) as unknown as { extractors: { register: jest.Mock } }

            for (let i = 0; i < 50; i++) {
                if (player.extractors.register.mock.calls.length > 0) break
                await new Promise((resolve) => setTimeout(resolve, 10))
            }

            const extractorOptions = player.extractors.register.mock
                .calls[0][1] as {
                createStream: (_track: unknown) => Promise<unknown>
            }

            const spotifyUrl = 'https://open.spotify.com/track/abc'
            const spawnCallsBefore = mockSpawn.mock.calls.length

            const result = await extractorOptions.createStream({
                url: spotifyUrl,
            })

            expect(result).toBe(spotifyUrl)
            // Only the --version check should have been spawned, not a new yt-dlp for non-YT URLs
            expect(mockSpawn.mock.calls.length).toBe(spawnCallsBefore)
        })
    })
})
