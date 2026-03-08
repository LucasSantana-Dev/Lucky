jest.mock('@discordjs/builders', () => ({
    SlashCommandBuilder: jest.fn().mockImplementation(() => ({
        setName: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        addStringOption: jest.fn().mockReturnThis(),
        addIntegerOption: jest.fn().mockReturnThis(),
        addBooleanOption: jest.fn().mockReturnThis(),
        toJSON: jest.fn().mockReturnValue({ name: 'test' }),
    })),
}))

import Command from '../../src/models/Command'
import type { CommandCategory } from '../../src/config/constants'

describe('Command', () => {
    it('stores data, execute, and category', () => {
        const mockData = {
            name: 'test',
            toJSON: () => ({ name: 'test' }),
        } as any
        const mockExecute = jest.fn()
        const category: CommandCategory = 'music'

        const command = new Command({
            data: mockData,
            execute: mockExecute,
            category,
        })

        expect(command.data).toBe(mockData)
        expect(command.execute).toBe(mockExecute)
        expect(command.category).toBe(category)
    })

    it('can be instantiated with different categories', () => {
        const mockData = { name: 'mod' } as any
        const mockExecute = jest.fn()

        const cmd = new Command({
            data: mockData,
            execute: mockExecute,
            category: 'moderation' as CommandCategory,
        })

        expect(cmd.category).toBe('moderation')
    })
})
