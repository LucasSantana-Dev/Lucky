import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import type {
    ChatInputCommandInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    StringSelectMenuInteraction,
    Interaction,
    EmbedBuilder,
} from 'discord.js'
import { interactionReply } from './interactionReply'

const mockErrorLog = jest.fn()
const mockDebugLog = jest.fn()
const mockErrorEmbed = jest.fn()
const mockInfoEmbed = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => mockErrorLog(...args),
    debugLog: (...args: unknown[]) => mockDebugLog(...args),
}))

jest.mock('./embeds', () => ({
    errorEmbed: (...args: unknown[]) => mockErrorEmbed(...args),
    infoEmbed: (...args: unknown[]) => mockInfoEmbed(...args),
}))

const createMockEmbed = (color?: number): EmbedBuilder => {
    return {
        toJSON: jest.fn(() => ({
            title: 'Test',
            description: 'Test description',
            color,
        })),
        setColor: jest.fn(),
        setTitle: jest.fn(),
        setDescription: jest.fn(),
    } as unknown as EmbedBuilder
}

describe('interactionReply', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockErrorEmbed.mockReturnValue(createMockEmbed(0xff0000))
        mockInfoEmbed.mockReturnValue(createMockEmbed(0x0099ff))
    })

    describe('non-replyable interactions', () => {
        it('logs debug message and returns early for non-replyable interaction', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
            } as unknown as Interaction

            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'test' },
            })

            expect(mockDebugLog).toHaveBeenCalledWith({
                message: 'Interaction does not support reply methods',
            })
            expect(mockErrorLog).not.toHaveBeenCalled()
        })

        it('does not attempt to reply on non-replyable interaction', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
            } as unknown as Interaction

            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'test' },
            })

            // Should not call any Discord API methods
            expect(mockErrorLog).not.toHaveBeenCalledWith(expect.anything())
        })
    })

    describe('chat input command interactions', () => {
        let mockInteraction: ChatInputCommandInteraction

        beforeEach(() => {
            mockInteraction = {
                isChatInputCommand: jest.fn(() => true),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as ChatInputCommandInteraction
        })

        it('defers reply and edits when not yet deferred or replied', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'test message' },
            })

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({
                flags: undefined,
            })
            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('sets ephemeral flag when ephemeral is true', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'secret', ephemeral: true },
            })

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({
                flags: 64,
            })
        })

        it('calls followUp when already replied', async () => {
            mockInteraction.replied = true

            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'follow up message' },
            })

            expect(mockInteraction.followUp).toHaveBeenCalled()
            expect(mockInteraction.editReply).not.toHaveBeenCalled()
        })

        it('converts plain text error message to error embed', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'error occurred' },
            })

            expect(mockErrorEmbed).toHaveBeenCalledWith(
                'Error',
                'error occurred',
            )
            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.embeds).toBeDefined()
            expect(callArgs.embeds?.length).toBeGreaterThan(0)
        })

        it('converts plain text info message to info embed', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'some info' },
            })

            expect(mockInfoEmbed).toHaveBeenCalledWith('Info', 'some info')
            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.embeds).toBeDefined()
        })

        it('does not convert empty content string', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: '' },
            })

            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.embeds?.length || 0).toBe(0)
        })

        it('does not convert when embeds already provided', async () => {
            const mockEmbed = {
                toJSON: jest.fn(() => ({ title: 'Custom' })),
            } as unknown as EmbedBuilder

            await interactionReply({
                interaction: mockInteraction,
                content: {
                    content: 'should be ignored',
                    embeds: [mockEmbed],
                },
            })

            expect(mockErrorEmbed).not.toHaveBeenCalled()
            expect(mockInfoEmbed).not.toHaveBeenCalled()
        })

        it('converts JSONEncodable embeds to plain APIEmbed objects', async () => {
            const mockEmbed = {
                toJSON: jest.fn(() => ({ title: 'Custom' })),
            } as unknown as EmbedBuilder

            await interactionReply({
                interaction: mockInteraction,
                content: { embeds: [mockEmbed] },
            })

            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.embeds?.[0]).toEqual({ title: 'Custom' })
        })

        it('handles deferred but not replied state', async () => {
            mockInteraction.deferred = true
            mockInteraction.replied = false

            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'test' },
            })

            expect(mockInteraction.deferReply).not.toHaveBeenCalled()
            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles error during deferReply gracefully', async () => {
            mockInteraction.deferReply = jest
                .fn()
                .mockRejectedValue(new Error('Defer failed'))

            await expect(
                interactionReply({
                    interaction: mockInteraction,
                    content: { content: 'test' },
                }),
            ).resolves.toBeUndefined()
        })

        it('handles error during editReply gracefully', async () => {
            mockInteraction.editReply = jest
                .fn()
                .mockRejectedValue(new Error('Edit failed'))

            await expect(
                interactionReply({
                    interaction: mockInteraction,
                    content: { content: 'test' },
                }),
            ).resolves.toBeUndefined()
        })

        it('removes flags from processed content before sending', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'test', ephemeral: true },
            })

            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.flags).toBeUndefined()
        })
    })

    describe('button interactions', () => {
        let mockInteraction: ButtonInteraction

        beforeEach(() => {
            mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => true),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as ButtonInteraction
        })

        it('handles button interaction with text content', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'button clicked' },
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles ephemeral button responses', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'secret', ephemeral: true },
            })

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({
                flags: 64,
            })
        })
    })

    describe('modal submit interactions', () => {
        let mockInteraction: ModalSubmitInteraction

        beforeEach(() => {
            mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => true),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as ModalSubmitInteraction
        })

        it('handles modal submit interaction', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'modal submitted' },
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(mockInteraction.editReply).toHaveBeenCalled()
        })
    })

    describe('select menu interactions', () => {
        it('handles string select menu', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => true),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as StringSelectMenuInteraction

            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'selected' },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles user select menu', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => true),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            }

            await interactionReply({
                interaction: mockInteraction as unknown as Interaction,
                content: { content: 'user selected' },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles channel select menu', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => true),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            }

            await interactionReply({
                interaction: mockInteraction as unknown as Interaction,
                content: { content: 'channel selected' },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles role select menu', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => true),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            }

            await interactionReply({
                interaction: mockInteraction as unknown as Interaction,
                content: { content: 'role selected' },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('handles mentionable select menu', async () => {
            const mockInteraction = {
                isChatInputCommand: jest.fn(() => false),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => true),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            }

            await interactionReply({
                interaction: mockInteraction as unknown as Interaction,
                content: { content: 'mentionable selected' },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })
    })

    describe('content handling', () => {
        let mockInteraction: ChatInputCommandInteraction

        beforeEach(() => {
            mockInteraction = {
                isChatInputCommand: jest.fn(() => true),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: false,
                replied: false,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as ChatInputCommandInteraction
        })

        it('handles undefined content gracefully', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: {},
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs).toBeDefined()
        })

        it('handles null-like content fields', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: undefined, embeds: undefined },
            })

            expect(mockInteraction.editReply).toHaveBeenCalled()
        })

        it('preserves embed array with mixed types', async () => {
            const mockEmbed1 = {
                toJSON: jest.fn(() => ({ title: 'Embed1' })),
            }
            const mockEmbed2 = { title: 'Embed2' }

            await interactionReply({
                interaction: mockInteraction,
                content: { embeds: [mockEmbed1, mockEmbed2] as never },
            })

            const callArgs = mockInteraction.editReply.mock.calls[0][0]
            expect(callArgs.embeds?.length).toBe(2)
        })

        it('case-insensitive error detection in content', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'ERROR: Something went wrong' },
            })

            expect(mockErrorEmbed).toHaveBeenCalledWith(
                'Error',
                expect.any(String),
            )
        })

        it('case-insensitive error detection with lowercase', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'This is an error message' },
            })

            expect(mockErrorEmbed).toHaveBeenCalled()
        })
    })

    describe('edge cases', () => {
        let mockInteraction: ChatInputCommandInteraction

        beforeEach(() => {
            mockInteraction = {
                isChatInputCommand: jest.fn(() => true),
                isButton: jest.fn(() => false),
                isModalSubmit: jest.fn(() => false),
                isStringSelectMenu: jest.fn(() => false),
                isUserSelectMenu: jest.fn(() => false),
                isChannelSelectMenu: jest.fn(() => false),
                isRoleSelectMenu: jest.fn(() => false),
                isMentionableSelectMenu: jest.fn(() => false),
                deferred: true,
                replied: true,
                deferReply: jest.fn().mockResolvedValue(undefined),
                editReply: jest.fn().mockResolvedValue(undefined),
                followUp: jest.fn().mockResolvedValue(undefined),
            } as unknown as ChatInputCommandInteraction
        })

        it('prefers followUp when already deferred and replied', async () => {
            await interactionReply({
                interaction: mockInteraction,
                content: { content: 'follow up' },
            })

            expect(mockInteraction.deferReply).not.toHaveBeenCalled()
            expect(mockInteraction.followUp).toHaveBeenCalled()
            expect(mockInteraction.editReply).not.toHaveBeenCalled()
        })

        it('handles deferReply that fails silently', async () => {
            mockInteraction.deferred = false
            mockInteraction.replied = false
            mockInteraction.deferReply = jest
                .fn()
                .mockRejectedValue(new Error())

            await expect(
                interactionReply({
                    interaction: mockInteraction,
                    content: { content: 'test' },
                }),
            ).resolves.toBeUndefined()
        })

        it('handles followUp that fails silently', async () => {
            mockInteraction.followUp = jest
                .fn()
                .mockRejectedValue(new Error('Expired'))

            await expect(
                interactionReply({
                    interaction: mockInteraction,
                    content: { content: 'test' },
                }),
            ).resolves.toBeUndefined()
        })
    })
})
