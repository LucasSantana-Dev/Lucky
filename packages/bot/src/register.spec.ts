import { describe, it, expect, beforeEach, jest } from '@jest/globals'

const downloadCommandsMock = jest.fn()
const generalCommandsMock = jest.fn()
const musicCommandsMock = jest.fn()
const automodCommandsMock = jest.fn()
const managementCommandsMock = jest.fn()
const moderationCommandsMock = jest.fn()

jest.mock('./functions/download/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => downloadCommandsMock(...args),
}))

jest.mock('./functions/general/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => generalCommandsMock(...args),
}))

jest.mock('./functions/music/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => musicCommandsMock(...args),
}))

jest.mock('./functions/automod/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => automodCommandsMock(...args),
}))

jest.mock('./functions/management/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => managementCommandsMock(...args),
}))

jest.mock('./functions/moderation/commands/index', () => ({
    __esModule: true,
    default: (...args: unknown[]) => moderationCommandsMock(...args),
}))

jest.mock('./handlers/commandsHandler', () => ({
    groupCommands: ({ commands }: { commands: unknown[] }) => commands,
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    debugLog: jest.fn(),
}))

describe('register.getCommands', () => {
    beforeEach(() => {
        jest.resetModules()
        jest.clearAllMocks()
        downloadCommandsMock.mockResolvedValue([{ data: { name: 'download' } }])
        generalCommandsMock.mockResolvedValue([{ data: { name: 'help' } }])
        musicCommandsMock.mockResolvedValue([{ data: { name: 'play' } }])
        automodCommandsMock.mockResolvedValue([{ data: { name: 'automod' } }])
        managementCommandsMock.mockResolvedValue([
            { data: { name: 'guildconfig' } },
        ])
        moderationCommandsMock.mockResolvedValue([{ data: { name: 'warn' } }])
    })

    it('loads all command groups including management and moderation', async () => {
        const { getCommands } = await import('./register')
        const commands = await getCommands()

        expect(commands.map((command: any) => command.data.name)).toEqual(
            expect.arrayContaining([
                'download',
                'help',
                'play',
                'automod',
                'guildconfig',
                'warn',
            ]),
        )
    })
})
