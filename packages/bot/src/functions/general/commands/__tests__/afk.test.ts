import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { CommandInteraction } from 'discord.js'
import afkCommand from '../afk'

jest.mock('@lucky/shared/services', () => ({
    afkService: {
        set: jest.fn(),
        clear: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

import { afkService } from '@lucky/shared/services'
import { interactionReply } from '../../../../utils/general/interactionReply'

describe('afk command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should have correct name and description', () => {
        expect(afkCommand.data.name).toBe('afk')
        expect(afkCommand.data.description).toContain('AFK')
    })

    it('should clear AFK status when no motivo provided', async () => {
        const mockInteraction = {
            guild: { id: 'guild1' },
            user: { id: 'user1', tag: 'testuser#0001' },
            options: { getString: jest.fn().mockReturnValue(null) },
        } as unknown as CommandInteraction

        ;(afkService.clear as jest.Mock).mockResolvedValue(undefined)

        await afkCommand.execute({
            client: {} as any,
            interaction: mockInteraction,
        })

        expect(afkService.clear).toHaveBeenCalledWith('guild1', 'user1')
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: mockInteraction,
            content: {
                content: expect.stringContaining('Welcome back'),
                ephemeral: true,
            },
        })
    })

    it('should set AFK status with reason when motivo provided', async () => {
        const mockInteraction = {
            guild: { id: 'guild1' },
            user: { id: 'user1', tag: 'testuser#0001' },
            options: { getString: jest.fn().mockReturnValue('In a meeting') },
        } as unknown as CommandInteraction

        ;(afkService.set as jest.Mock).mockResolvedValue({
            id: 'afk1',
            guildId: 'guild1',
            userId: 'user1',
            reason: 'In a meeting',
            since: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        await afkCommand.execute({
            client: {} as any,
            interaction: mockInteraction,
        })

        expect(afkService.set).toHaveBeenCalledWith(
            'guild1',
            'user1',
            'In a meeting',
        )
        expect(interactionReply).toHaveBeenCalledWith({
            interaction: mockInteraction,
            content: {
                content: expect.stringContaining('In a meeting'),
                ephemeral: true,
            },
        })
    })

    it('should reply with error when guild not found', async () => {
        const mockInteraction = {
            guild: null,
            user: { id: 'user1', tag: 'testuser#0001' },
            options: { getString: jest.fn().mockReturnValue('Away') },
        } as unknown as CommandInteraction

        await afkCommand.execute({
            client: {} as any,
            interaction: mockInteraction,
        })

        expect(interactionReply).toHaveBeenCalledWith({
            interaction: mockInteraction,
            content: {
                content: expect.stringContaining('Unable to determine guild'),
                ephemeral: true,
            },
        })
        expect(afkService.set).not.toHaveBeenCalled()
    })

    it('should handle errors and reply with error message', async () => {
        const mockInteraction = {
            guild: { id: 'guild1' },
            user: { id: 'user1', tag: 'testuser#0001' },
            options: { getString: jest.fn().mockReturnValue('Away') },
        } as unknown as CommandInteraction

        ;(afkService.set as jest.Mock).mockRejectedValue(new Error('DB error'))

        await afkCommand.execute({
            client: {} as any,
            interaction: mockInteraction,
        })

        const calls = (interactionReply as jest.Mock).mock.calls
        const errorCall = calls.find((c) =>
            c[0].content.content?.includes('Failed'),
        )
        expect(errorCall).toBeDefined()
    })
})
