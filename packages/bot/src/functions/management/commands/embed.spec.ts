import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const interactionReplyMock = jest.fn()
const showModalMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const embedBuilderServiceMock = {
	getTemplate: jest.fn(),
	listTemplates: jest.fn(),
	deleteTemplate: jest.fn(),
	incrementUsage: jest.fn(),
	createTemplate: jest.fn(),
	upsertTemplate: jest.fn(),
	updateTemplate: jest.fn(),
	validateEmbedData: jest.fn(),
	hexToDecimal: jest.fn(),
	decimalToHex: jest.fn(),
}

jest.mock('../../../utils/general/interactionReply.js', () => ({
	interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
	errorLog: (...args: unknown[]) => errorLogMock(...args),
	infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
	embedBuilderService: embedBuilderServiceMock,
	hexToDecimal: (hex: string) => parseInt(hex.replace('#', ''), 16),
}))

// Import after mocks are set up
import embedCommand from './embed.js'

function createChatInputInteraction(
	subcommand: string,
	options: Record<string, unknown> = {},
): ChatInputCommandInteraction {
	const mockInteraction = {
		guild: {
			id: 'guild-123',
			name: 'Test Guild',
		},
		channel: {
			id: 'channel-123',
			send: jest.fn(),
			isTextBased: jest.fn().mockReturnValue(true),
		},
		user: {
			id: 'user-123',
			tag: 'testuser#0001',
		},
		options: {
			getSubcommand: jest.fn().mockReturnValue(subcommand),
			getString: jest.fn((key: string) => {
				const val = options[key]
				return typeof val === 'string' ? val : null
			}),
			getChannel: jest.fn((key: string) => {
				const val = options[key]
				// Return null unless it's explicitly a channel-like object
				if (val && typeof val === 'object' && 'send' in val) {
					return val
				}
				return null
			}),
		},
		showModal: showModalMock,
		isChatInputCommand: jest.fn(() => true),
		isModalSubmit: jest.fn(() => false),
	} as unknown as ChatInputCommandInteraction

	return mockInteraction
}

describe('embed command', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		interactionReplyMock.mockResolvedValue(undefined)
		showModalMock.mockResolvedValue(undefined)
		embedBuilderServiceMock.getTemplate.mockResolvedValue(null)
		embedBuilderServiceMock.listTemplates.mockResolvedValue([])
		embedBuilderServiceMock.deleteTemplate.mockResolvedValue(undefined)
		embedBuilderServiceMock.incrementUsage.mockResolvedValue(undefined)
		embedBuilderServiceMock.createTemplate.mockResolvedValue({
			id: 'template-1',
			guildId: 'guild-123',
			name: 'test-template',
			title: 'Test',
			description: null,
			color: null,
			footer: null,
			thumbnail: null,
			image: null,
			fields: null,
			useCount: 0,
			createdBy: 'user-123',
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		embedBuilderServiceMock.hexToDecimal.mockImplementation((hex: string) =>
			parseInt(hex.replace('#', ''), 16),
		)
	})

	describe('command metadata', () => {
		it('defines command with correct name and description', () => {
			expect(embedCommand.data.name).toBe('embed')
			expect(embedCommand.data.description).toBe('Manage embed templates')
		})

		it('sets correct category', () => {
			expect(embedCommand.category).toBe('management')
		})
	})

	describe('guild validation', () => {
		it('rejects command when used outside of a guild', async () => {
			const interaction = createChatInputInteraction('create')
			interaction.guild = null

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ This command can only be used in a server.',
				},
			})
		})
	})

	describe('create subcommand', () => {
		it('shows modal when template name is unique', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue(null)
			const interaction = createChatInputInteraction('create', {
				name: 'my-template',
			})

			await embedCommand.execute({ interaction })

			expect(showModalMock).toHaveBeenCalled()
			const modalCall = showModalMock.mock.calls[0][0]
			expect(modalCall.data.custom_id).toBe('embed_create_my-template')
			expect(modalCall.data.title).toBe('Create Embed Template')
		})

		it('rejects duplicate template names', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'existing',
				guildId: 'guild-123',
				title: null,
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('create', {
				name: 'existing',
			})

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ A template named `existing` already exists.',
				},
			})
			expect(showModalMock).not.toHaveBeenCalled()
		})

		it('normalizes template name to lowercase', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue(null)
			const interaction = createChatInputInteraction('create', {
				name: 'MyTemplate',
			})

			await embedCommand.execute({ interaction })

			// Check that getTemplate was called with lowercase name
			expect(embedBuilderServiceMock.getTemplate).toHaveBeenCalledWith(
				'guild-123',
				'mytemplate',
			)
		})
	})

	describe('send subcommand', () => {
		it('sends embed template to specified channel', async () => {
			const mockChannel = {
				id: 'channel-456',
				send: jest.fn(),
				isTextBased: jest.fn().mockReturnValue(true),
			}

			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'greeting',
				guildId: 'guild-123',
				title: 'Welcome!',
				description: 'Welcome to the server',
				color: '#5865F2',
				footer: 'Thanks for joining',
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('send', {
				template: 'greeting',
				channel: mockChannel,
			})

			await embedCommand.execute({ interaction })

			expect(mockChannel.send).toHaveBeenCalled()
			expect(embedBuilderServiceMock.incrementUsage).toHaveBeenCalledWith(
				'guild-123',
				'greeting',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						content: expect.stringContaining('✅ Embed sent'),
					}),
				}),
			)
		})

		it('sends embed to current channel when no channel specified', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'greeting',
				guildId: 'guild-123',
				title: 'Welcome!',
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('send', {
				template: 'greeting',
				channel: null,
			})

			await embedCommand.execute({ interaction })

			expect(interaction.channel.send).toHaveBeenCalled()
		})

		it('rejects send to missing template', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue(null)

			const interaction = createChatInputInteraction('send', {
				template: 'nonexistent',
				channel: null,
			})

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Template `nonexistent` not found.',
				},
			})
		})

		it('handles invalid channel with no send method gracefully', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'test',
				guildId: 'guild-123',
				title: 'Test',
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			// Create interaction that returns an object without send method from getChannel
			const interaction = {
				guild: {
					id: 'guild-123',
					name: 'Test Guild',
				},
				channel: {
					id: 'channel-123',
					send: jest.fn(),
				},
				user: {
					id: 'user-123',
					tag: 'testuser#0001',
				},
				options: {
					getSubcommand: jest.fn().mockReturnValue('send'),
					getString: jest.fn((key: string) => {
						if (key === 'template') return 'test'
						return null
					}),
					getChannel: jest.fn((key: string) => {
						// Explicitly return a channel-like object without send
						if (key === 'channel') return { id: 'channel-456' } // no send
						return null
					}),
				},
				showModal: showModalMock,
				isChatInputCommand: jest.fn(() => true),
				isModalSubmit: jest.fn(() => false),
			} as unknown as ChatInputCommandInteraction

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Invalid channel.',
				},
			})
		})

		it('rejects send to non-text-based channel', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'test',
				guildId: 'guild-123',
				title: 'Test',
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			// Channel with a send method but not text-based (isTextBased() false)
			const nonTextChannel = {
				id: 'channel-456',
				send: jest.fn(),
				isTextBased: jest.fn().mockReturnValue(false),
			}

			const interaction = createChatInputInteraction('send', {
				template: 'test',
				channel: nonTextChannel,
			})

			await embedCommand.execute({ interaction })

			expect(nonTextChannel.send).not.toHaveBeenCalled()
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Invalid channel.',
				},
			})
		})
	})

	describe('list subcommand', () => {
		it('lists all templates in guild', async () => {
			const templates = [
				{
					id: '1',
					name: 'welcome',
					guildId: 'guild-123',
					title: 'Welcome',
					description: 'Welcome message',
					useCount: 5,
					color: null,
					footer: null,
					thumbnail: null,
					image: null,
					fields: null,
					createdBy: 'user-123',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: '2',
					name: 'goodbye',
					guildId: 'guild-123',
					title: 'Goodbye',
					description: null,
					useCount: 2,
					color: null,
					footer: null,
					thumbnail: null,
					image: null,
					fields: null,
					createdBy: 'user-123',
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]

			embedBuilderServiceMock.listTemplates.mockResolvedValue(templates)

			const interaction = createChatInputInteraction('list')

			await embedCommand.execute({ interaction })

			expect(embedBuilderServiceMock.listTemplates).toHaveBeenCalledWith(
				'guild-123',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						embeds: expect.any(Array),
					}),
				}),
			)

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			expect(embed.data.title).toBe('📋 Embed Templates')
		})

		it('shows message when no templates exist', async () => {
			embedBuilderServiceMock.listTemplates.mockResolvedValue([])

			const interaction = createChatInputInteraction('list')

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '📋 No embed templates found.',
				},
			})
		})
	})

	describe('delete subcommand', () => {
		it('deletes existing template', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'old-template',
				guildId: 'guild-123',
				title: 'Old',
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('delete', {
				template: 'old-template',
			})

			await embedCommand.execute({ interaction })

			expect(embedBuilderServiceMock.deleteTemplate).toHaveBeenCalledWith(
				'guild-123',
				'old-template',
			)
			expect(interactionReplyMock).toHaveBeenCalled()
			expect(infoLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('old-template'),
				}),
			)
		})

		it('rejects delete of non-existent template', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue(null)

			const interaction = createChatInputInteraction('delete', {
				template: 'nonexistent',
			})

			await embedCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Template `nonexistent` not found.',
				},
			})
			expect(embedBuilderServiceMock.deleteTemplate).not.toHaveBeenCalled()
		})
	})

	describe('error handling', () => {
		it('catches and logs errors from service calls', async () => {
			const error = new Error('Database error')
			embedBuilderServiceMock.listTemplates.mockRejectedValue(error)

			const interaction = createChatInputInteraction('list')

			await embedCommand.execute({ interaction })

			expect(errorLogMock).toHaveBeenCalledWith({
				message: 'Failed to manage embed template',
				error,
			})
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Failed to manage embed template. Please try again.',
				},
			})
		})

		it('catches errors on create modal show', async () => {
			showModalMock.mockRejectedValue(new Error('Modal error'))

			const interaction = createChatInputInteraction('create', {
				name: 'test',
			})

			await embedCommand.execute({ interaction })

			expect(errorLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Failed to manage embed template',
				}),
			)
		})
	})

	describe('edge cases', () => {
		it('handles oversized embed fields gracefully', async () => {
			const largeDescription = 'x'.repeat(5000) // exceeds 4096 char limit

			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'huge',
				guildId: 'guild-123',
				title: 'Test',
				description: largeDescription,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: null,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('send', {
				template: 'huge',
			})

			// Discord.js EmbedBuilder validates field lengths and throws on oversized content
			await embedCommand.execute({ interaction })

			// Should not send to channel due to validation error
			expect(interaction.channel.send).not.toHaveBeenCalled()
			// But should handle the error gracefully
			expect(errorLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Failed to manage embed template',
				}),
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content:
						'❌ Failed to manage embed template. Please try again.',
				},
			})
		})

		it('handles array fields correctly when template has fields', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue({
				id: 'template-1',
				name: 'with-fields',
				guildId: 'guild-123',
				title: 'Test',
				description: null,
				color: null,
				footer: null,
				thumbnail: null,
				image: null,
				fields: [
					{ name: 'Field1', value: 'Value1' },
					{ name: 'Field2', value: 'Value2' },
				],
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
			})

			const interaction = createChatInputInteraction('send', {
				template: 'with-fields',
			})

			await embedCommand.execute({ interaction })

			const sendCall = interaction.channel.send.mock.calls[0]
			expect(sendCall[0].embeds[0].data.fields).toBeDefined()
			expect(sendCall[0].embeds[0].data.fields?.length).toBe(2)
		})

		it('normalizes template names to lowercase for all operations', async () => {
			embedBuilderServiceMock.getTemplate.mockResolvedValue(null)

			const interaction = createChatInputInteraction('delete', {
				template: 'MyUppercaseTemplate',
			})

			await embedCommand.execute({ interaction })

			expect(embedBuilderServiceMock.getTemplate).toHaveBeenCalledWith(
				'guild-123',
				'myuppercasetemplate',
			)
		})
	})
})
