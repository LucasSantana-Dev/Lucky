import { execFile } from 'child_process'

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

describe('playerFactory', () => {
    beforeEach(() => {
        jest.resetModules()
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
    })
})
