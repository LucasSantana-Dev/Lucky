import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const interactionReplyMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()
const customCommandServiceMock = {
	getCommand: jest.fn(),
	listCommands: jest.fn(),
	deleteCommand: jest.fn(),
	createCommand: jest.fn(),
	updateCommand: jest.fn(),
}

jest.mock('../../../utils/general/interactionReply.js', () => ({
	interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
	errorLog: (...args: unknown[]) => errorLogMock(...args),
	infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
	customCommandService: customCommandServiceMock,
}))

// Import after mocks are set up
import customcommandCommand from './customcommand.js'

function createChatInputInteraction(
	subcommand: string,
	options: Record<string, unknown> = {},
): ChatInputCommandInteraction {
	const mockInteraction = {
		guild: {
			id: 'guild-123',
			name: 'Test Guild',
		},
		user: {
			id: 'user-123',
			tag: 'testuser#0001',
		},
		options: {
			getSubcommand: jest.fn().mockReturnValue(subcommand),
			getString: jest.fn((key: string, required?: boolean) => {
				const val = options[key]
				return typeof val === 'string' ? val : null
			}),
		},
	} as unknown as ChatInputCommandInteraction

	return mockInteraction
}

describe('customcommand command', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		interactionReplyMock.mockResolvedValue(undefined)
		customCommandServiceMock.getCommand.mockResolvedValue(null)
		customCommandServiceMock.listCommands.mockResolvedValue([])
		customCommandServiceMock.deleteCommand.mockResolvedValue(undefined)
		customCommandServiceMock.createCommand.mockResolvedValue({
			id: 'cmd-1',
			guildId: 'guild-123',
			name: 'test',
			response: 'Test response',
			description: 'A test command',
			embedData: null,
			allowedRoles: [],
			allowedChannels: [],
			enabled: true,
			useCount: 0,
			createdBy: 'user-123',
			createdAt: new Date(),
			updatedAt: new Date(),
			lastUsed: null,
		})
		customCommandServiceMock.updateCommand.mockResolvedValue({
			id: 'cmd-1',
			guildId: 'guild-123',
			name: 'test',
			response: 'Updated response',
			description: 'Updated description',
			embedData: null,
			allowedRoles: [],
			allowedChannels: [],
			enabled: true,
			useCount: 5,
			createdBy: 'user-123',
			createdAt: new Date(),
			updatedAt: new Date(),
			lastUsed: new Date(),
		})
	})

	describe('command metadata', () => {
		it('defines command with correct name and description', () => {
			expect(customcommandCommand.data.name).toBe('customcommand')
			expect(customcommandCommand.data.description).toBe(
				'Manage custom commands',
			)
		})

		it('sets correct category', () => {
			expect(customcommandCommand.category).toBe('management')
		})

		it('requires ManageGuild permission', () => {
			expect(customcommandCommand.data.default_member_permissions).toBeDefined()
		})
	})

	describe('guild validation', () => {
		it('rejects command when used outside of a guild', async () => {
			const interaction = createChatInputInteraction('create')
			interaction.guild = null

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ This command can only be used in a server.',
				},
			})
		})
	})

	describe('create subcommand', () => {
		it('creates a custom command with name and response', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)
			const interaction = createChatInputInteraction('create', {
				name: 'hello',
				response: 'Hello world!',
				description: 'Says hello',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
				'guild-123',
				'hello',
			)
			expect(customCommandServiceMock.createCommand).toHaveBeenCalledWith(
				'guild-123',
				'hello',
				'Hello world!',
				expect.objectContaining({
					description: 'Says hello',
					createdBy: 'user-123',
				}),
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					embeds: expect.any(Array),
				},
			})
			expect(infoLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('hello'),
				}),
			)
		})

		it('normalizes command name to lowercase', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)
			const interaction = createChatInputInteraction('create', {
				name: 'HelloWorld',
				response: 'Test',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
				'guild-123',
				'helloworld',
			)
			expect(customCommandServiceMock.createCommand).toHaveBeenCalledWith(
				'guild-123',
				'helloworld',
				'Test',
				expect.any(Object),
			)
		})

		it('rejects duplicate command names', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'existing',
				guildId: 'guild-123',
				response: 'Existing response',
				description: null,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})

			const interaction = createChatInputInteraction('create', {
				name: 'existing',
				response: 'New response',
			})

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ A command named `existing` already exists.',
				},
			})
			expect(customCommandServiceMock.createCommand).not.toHaveBeenCalled()
		})

		it('handles optional description gracefully', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)
			const interaction = createChatInputInteraction('create', {
				name: 'nodesc',
				response: 'Response without description',
				description: null,
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.createCommand).toHaveBeenCalledWith(
				'guild-123',
				'nodesc',
				'Response without description',
				expect.objectContaining({
					description: undefined,
				}),
			)
		})

		it('truncates long response in success embed', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)
			const longResponse = 'x'.repeat(150)
			const interaction = createChatInputInteraction('create', {
				name: 'long',
				response: longResponse,
			})

			await customcommandCommand.execute({ interaction })

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			const responseField = embed.data.fields?.find(
				(f: any) => f.name === 'Response',
			)
			expect(responseField.value).toHaveLength(100) // 97 + '...'
			expect(responseField.value).toMatch(/\.\.\.$/)
		})
	})

	describe('edit subcommand', () => {
		it('edits response of existing command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'greet',
				guildId: 'guild-123',
				response: 'Old response',
				description: 'A greeting',
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 5,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: new Date(),
			})

			const interaction = createChatInputInteraction('edit', {
				name: 'greet',
				response: 'New greeting!',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.updateCommand).toHaveBeenCalledWith(
				'guild-123',
				'greet',
				expect.objectContaining({
					response: 'New greeting!',
				}),
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					embeds: expect.any(Array),
				},
			})
		})

		it('edits description of existing command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'test',
				guildId: 'guild-123',
				response: 'Response',
				description: 'Old description',
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})

			const interaction = createChatInputInteraction('edit', {
				name: 'test',
				description: 'New description',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.updateCommand).toHaveBeenCalledWith(
				'guild-123',
				'test',
				expect.objectContaining({
					description: 'New description',
				}),
			)
		})

		it('rejects edit of non-existent command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)

			const interaction = createChatInputInteraction('edit', {
				name: 'nonexistent',
				response: 'New response',
			})

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Command `nonexistent` not found.',
				},
			})
			expect(customCommandServiceMock.updateCommand).not.toHaveBeenCalled()
		})

		it('normalizes command name to lowercase for edit', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'mycommand',
				guildId: 'guild-123',
				response: 'Response',
				description: null,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})

			const interaction = createChatInputInteraction('edit', {
				name: 'MyCommand',
				response: 'Updated',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
				'guild-123',
				'mycommand',
			)
		})
	})

	describe('delete subcommand', () => {
		it('deletes an existing command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'old-command',
				guildId: 'guild-123',
				response: 'Response',
				description: null,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})

			const interaction = createChatInputInteraction('delete', {
				name: 'old-command',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.deleteCommand).toHaveBeenCalledWith(
				'guild-123',
				'old-command',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					embeds: expect.any(Array),
				},
			})
			expect(infoLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('old-command'),
				}),
			)
		})

		it('rejects delete of non-existent command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)

			const interaction = createChatInputInteraction('delete', {
				name: 'nonexistent',
			})

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Command `nonexistent` not found.',
				},
			})
			expect(customCommandServiceMock.deleteCommand).not.toHaveBeenCalled()
		})

		it('normalizes command name to lowercase for delete', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'test',
				guildId: 'guild-123',
				response: 'Response',
				description: null,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})

			const interaction = createChatInputInteraction('delete', {
				name: 'TeSt',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
				'guild-123',
				'test',
			)
		})
	})

	describe('list subcommand', () => {
		it('lists all custom commands in guild', async () => {
			const commands = [
				{
					id: '1',
					name: 'hello',
					guildId: 'guild-123',
					response: 'Hello response',
					description: 'A greeting',
					useCount: 10,
					embedData: null,
					allowedRoles: [],
					allowedChannels: [],
					enabled: true,
					createdBy: 'user-123',
					createdAt: new Date(),
					updatedAt: new Date(),
					lastUsed: new Date(),
				},
				{
					id: '2',
					name: 'goodbye',
					guildId: 'guild-123',
					response: 'Goodbye response',
					description: null,
					useCount: 3,
					embedData: null,
					allowedRoles: [],
					allowedChannels: [],
					enabled: true,
					createdBy: 'user-123',
					createdAt: new Date(),
					updatedAt: new Date(),
					lastUsed: new Date(),
				},
			]

			customCommandServiceMock.listCommands.mockResolvedValue(commands)

			const interaction = createChatInputInteraction('list')

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.listCommands).toHaveBeenCalledWith(
				'guild-123',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					embeds: expect.any(Array),
				},
			})

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			expect(embed.data.title).toContain('📋')
			expect(embed.data.footer).toBeDefined()
		})

		it('shows empty state when no commands exist', async () => {
			customCommandServiceMock.listCommands.mockResolvedValue([])

			const interaction = createChatInputInteraction('list')

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '📋 No custom commands found.',
				},
			})
		})

		it('includes use count and description in list embed', async () => {
			const commands = [
				{
					id: '1',
					name: 'test',
					guildId: 'guild-123',
					response: 'Response',
					description: 'Test description',
					useCount: 5,
					embedData: null,
					allowedRoles: [],
					allowedChannels: [],
					enabled: true,
					createdBy: 'user-123',
					createdAt: new Date(),
					updatedAt: new Date(),
					lastUsed: new Date(),
				},
			]

			customCommandServiceMock.listCommands.mockResolvedValue(commands)

			const interaction = createChatInputInteraction('list')

			await customcommandCommand.execute({ interaction })

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			expect(embed.data.description).toContain('test')
			expect(embed.data.description).toContain('5 times')
		})
	})

	describe('info subcommand', () => {
		it('displays detailed info about a command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'test',
				guildId: 'guild-123',
				response: 'Test response',
				description: 'A test command',
				useCount: 15,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				createdBy: 'user-123',
				createdAt: new Date('2026-01-15'),
				updatedAt: new Date(),
				lastUsed: new Date('2026-05-20'),
			})

			const interaction = createChatInputInteraction('info', {
				name: 'test',
			})

			await customcommandCommand.execute({ interaction })

			expect(customCommandServiceMock.getCommand).toHaveBeenCalledWith(
				'guild-123',
				'test',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					embeds: expect.any(Array),
				},
			})

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			expect(embed.data.title).toContain('test')
			expect(embed.data.fields).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'Response' }),
					expect.objectContaining({ name: 'Use Count' }),
					expect.objectContaining({ name: 'Created By' }),
				]),
			)
		})

		it('rejects info request for non-existent command', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue(null)

			const interaction = createChatInputInteraction('info', {
				name: 'nonexistent',
			})

			await customcommandCommand.execute({ interaction })

			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content: '❌ Command `nonexistent` not found.',
				},
			})
		})

		it('includes optional fields when present', async () => {
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'restricted',
				guildId: 'guild-123',
				response: 'Response',
				description: 'Restricted command',
				useCount: 5,
				embedData: null,
				allowedRoles: ['role-1', 'role-2'],
				allowedChannels: [],
				enabled: true,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: new Date(),
			})

			const interaction = createChatInputInteraction('info', {
				name: 'restricted',
			})

			await customcommandCommand.execute({ interaction })

			const embedCall = interactionReplyMock.mock.calls[0][0]
			const embed = embedCall.content.embeds[0]
			expect(embed.data.fields).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'Description' }),
					expect.objectContaining({ name: 'Allowed Roles' }),
				]),
			)
		})
	})

	describe('error handling', () => {
		it('catches and logs errors from service calls', async () => {
			const error = new Error('Database error')
			customCommandServiceMock.listCommands.mockRejectedValue(error)

			const interaction = createChatInputInteraction('list')

			await customcommandCommand.execute({ interaction })

			expect(errorLogMock).toHaveBeenCalledWith({
				message: 'Failed to manage custom command',
				error,
			})
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content:
						'❌ Failed to manage custom command. Please try again.',
				},
			})
		})

		it('handles create command errors gracefully', async () => {
			const error = new Error('Create failed')
			customCommandServiceMock.getCommand.mockResolvedValue(null)
			customCommandServiceMock.createCommand.mockRejectedValue(error)

			const interaction = createChatInputInteraction('create', {
				name: 'test',
				response: 'Test',
			})

			await customcommandCommand.execute({ interaction })

			expect(errorLogMock).toHaveBeenCalled()
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content:
						'❌ Failed to manage custom command. Please try again.',
				},
			})
		})

		it('handles delete command errors gracefully', async () => {
			const error = new Error('Delete failed')
			customCommandServiceMock.getCommand.mockResolvedValue({
				id: 'cmd-1',
				name: 'test',
				guildId: 'guild-123',
				response: 'Response',
				description: null,
				embedData: null,
				allowedRoles: [],
				allowedChannels: [],
				enabled: true,
				useCount: 0,
				createdBy: 'user-123',
				createdAt: new Date(),
				updatedAt: new Date(),
				lastUsed: null,
			})
			customCommandServiceMock.deleteCommand.mockRejectedValue(error)

			const interaction = createChatInputInteraction('delete', {
				name: 'test',
			})

			await customcommandCommand.execute({ interaction })

			expect(errorLogMock).toHaveBeenCalled()
			expect(interactionReplyMock).toHaveBeenCalledWith({
				interaction,
				content: {
					content:
						'❌ Failed to manage custom command. Please try again.',
				},
			})
		})
	})
})
