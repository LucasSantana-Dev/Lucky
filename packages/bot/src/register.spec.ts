import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { SlashCommandBuilder } from '@discordjs/builders'
import Command from './models/Command'
import { getCommands } from './register'
import downloadCommands from './functions/download/commands/index'
import generalCommands from './functions/general/commands/index'
import musicCommands from './functions/music/commands/index'
import moderationCommands from './functions/moderation/commands/index'
import managementCommands from './functions/management/commands/index'
import automodCommands from './functions/automod/commands/index'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))
jest.mock('./handlers/commandsHandler', () => ({
    groupCommands: ({ commands }: { commands: Command[] }) => commands,
}))

jest.mock('./functions/download/commands/index', () => jest.fn())
jest.mock('./functions/general/commands/index', () => jest.fn())
jest.mock('./functions/music/commands/index', () => jest.fn())
jest.mock('./functions/moderation/commands/index', () => jest.fn())
jest.mock('./functions/management/commands/index', () => jest.fn())
jest.mock('./functions/automod/commands/index', () => jest.fn())

function makeCommand(name: string, category: any): Command {
    return new Command({
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(`${name} cmd`),
        category,
        execute: async () => {},
    })
}

describe('getCommands', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('loads commands from all command categories', async () => {
        ;(downloadCommands as jest.Mock).mockResolvedValue([
            makeCommand('download', 'download'),
        ])
        ;(generalCommands as jest.Mock).mockResolvedValue([
            makeCommand('help', 'general'),
        ])
        ;(musicCommands as jest.Mock).mockResolvedValue([
            makeCommand('play', 'music'),
        ])
        ;(moderationCommands as jest.Mock).mockResolvedValue([
            makeCommand('warn', 'moderation'),
        ])
        ;(managementCommands as jest.Mock).mockResolvedValue([
            makeCommand('serversetup', 'management'),
        ])
        ;(automodCommands as jest.Mock).mockResolvedValue([
            makeCommand('automod', 'automod'),
        ])

        const commands = await getCommands()
        const names = commands.map((command) => command.data.name)

        expect(downloadCommands).toHaveBeenCalledTimes(1)
        expect(generalCommands).toHaveBeenCalledTimes(1)
        expect(musicCommands).toHaveBeenCalledTimes(1)
        expect(moderationCommands).toHaveBeenCalledTimes(1)
        expect(managementCommands).toHaveBeenCalledTimes(1)
        expect(automodCommands).toHaveBeenCalledTimes(1)

        expect(names).toContain('download')
        expect(names).toContain('help')
        expect(names).toContain('play')
        expect(names).toContain('warn')
        expect(names).toContain('serversetup')
        expect(names).toContain('automod')
    })
})
