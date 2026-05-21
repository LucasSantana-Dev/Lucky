import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn<(interaction: unknown) => Promise<boolean>>()
const collaborativePlaylistServiceMock = {
	setMode: jest.fn(),
	getState: jest.fn(),
	resetContributions: jest.fn(),
}
const createInfoEmbedMock = jest.fn()
const createSuccessEmbedMock = jest.fn()
const createWarningEmbedMock = jest.fn()

jest.mock('../../../utils/general/interactionReply.js', () => ({
	interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
	requireGuild: (interaction: unknown) => requireGuildMock(interaction),
}))

jest.mock('../../../utils/music/collaborativePlaylist', () => ({
	collaborativePlaylistService: collaborativePlaylistServiceMock,
}))

jest.mock('../../../utils/general/embeds', () => ({
	createInfoEmbed: (title: string, message: string) =>
		createInfoEmbedMock(title, message),
	createSuccessEmbed: (title: string, message: string) =>
		createSuccessEmbedMock(title, message),
	createWarningEmbed: (title: string, message: string) =>
		createWarningEmbedMock(title, message),
}))

import playlistCommand from './playlist'

function createInteraction(
	action: string,
	limit?: number,
): ChatInputCommandInteraction {
	return {
		guildId: 'guild-123',
		options: {
			getString: jest.fn((key: string) => {
				return key === 'action' ? action : null
			}),
			getInteger: jest.fn((key: string) => {
				return key === 'per_user_limit' ? limit ?? null : null
			}),
		},
		reply: jest.fn(),
	} as unknown as ChatInputCommandInteraction
}

describe('playlist command', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		interactionReplyMock.mockResolvedValue(undefined)
		requireGuildMock.mockResolvedValue(true)
		createInfoEmbedMock.mockReturnValue({
			title: 'Info',
			description: 'Info embed',
		})
		createSuccessEmbedMock.mockReturnValue({
			title: 'Success',
			description: 'Success embed',
		})
		createWarningEmbedMock.mockReturnValue({
			title: 'Warning',
			description: 'Warning embed',
		})
		collaborativePlaylistServiceMock.setMode.mockReturnValue({
			enabled: true,
			perUserLimit: 3,
			contributions: {},
			updatedAt: Date.now(),
		})
		collaborativePlaylistServiceMock.getState.mockReturnValue({
			enabled: false,
			perUserLimit: 3,
			contributions: {},
			updatedAt: Date.now(),
		})
		collaborativePlaylistServiceMock.resetContributions.mockReturnValue({
			enabled: true,
			perUserLimit: 3,
			contributions: {},
			updatedAt: Date.now(),
		})
	})

	describe('command metadata', () => {
		it('defines command with correct name and description', () => {
			expect(playlistCommand.data.name).toBe('playlist')
			expect(playlistCommand.data.description).toContain(
				'Playlist collaboration',
			)
		})

		it('has collaborative subcommand', () => {
			const subcommands = playlistCommand.data.options || []
			const collaborativeSubcommand = subcommands.find(
				(opt: any) => opt.name === 'collaborative',
			)

			expect(collaborativeSubcommand).toBeDefined()
		})
	})

	describe('action: enable', () => {
		it('enables collaborative mode with default limit', async () => {
			const interaction = createInteraction('enable')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				true,
				undefined,
			)
			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						embeds: expect.any(Array),
					}),
				}),
			)
		})

		it('enables collaborative mode with custom per_user_limit', async () => {
			const interaction = createInteraction('enable', 5)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				true,
				5,
			)
		})

		it('returns success embed', async () => {
			const interaction = createInteraction('enable', 4)
			collaborativePlaylistServiceMock.setMode.mockReturnValue({
				enabled: true,
				perUserLimit: 4,
				contributions: {},
				updatedAt: Date.now(),
			})

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						embeds: expect.any(Array),
					}),
				}),
			)
			expect(createSuccessEmbedMock).toHaveBeenCalled()
		})
	})

	describe('action: disable', () => {
		it('disables collaborative mode', async () => {
			const interaction = createInteraction('disable')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				false,
			)
		})

		it('returns warning embed', async () => {
			const interaction = createInteraction('disable')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						embeds: expect.any(Array),
					}),
				}),
			)
			expect(createWarningEmbedMock).toHaveBeenCalled()
		})
	})

	describe('action: status', () => {
		it('retrieves and displays current state', async () => {
			const interaction = createInteraction('status')
			collaborativePlaylistServiceMock.getState.mockReturnValue({
				enabled: true,
				perUserLimit: 3,
				contributions: { 'user-1': 2, 'user-2': 1 },
				updatedAt: Date.now(),
			})

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.getState).toHaveBeenCalledWith(
				'guild-123',
			)
			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						ephemeral: true,
					}),
				}),
			)
		})

		it('displays per-user limit in status', async () => {
			const interaction = createInteraction('status')
			collaborativePlaylistServiceMock.getState.mockReturnValue({
				enabled: false,
				perUserLimit: 5,
				contributions: {},
				updatedAt: Date.now(),
			})

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(createInfoEmbedMock).toHaveBeenCalledWith(
				expect.stringContaining('status'),
				expect.stringContaining('5'),
			)
		})

		it('shows contributions in status', async () => {
			const interaction = createInteraction('status')
			collaborativePlaylistServiceMock.getState.mockReturnValue({
				enabled: true,
				perUserLimit: 3,
				contributions: { 'user-1': 2 },
				updatedAt: Date.now(),
			})

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(createInfoEmbedMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining('user-1'),
			)
		})

		it('shows "No contributions yet" when empty', async () => {
			const interaction = createInteraction('status')
			collaborativePlaylistServiceMock.getState.mockReturnValue({
				enabled: true,
				perUserLimit: 3,
				contributions: {},
				updatedAt: Date.now(),
			})

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(createInfoEmbedMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining('No contributions yet'),
			)
		})

		it('marks status reply as ephemeral', async () => {
			const interaction = createInteraction('status')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.objectContaining({
						ephemeral: true,
					}),
				}),
			)
		})
	})

	describe('action: reset', () => {
		it('calls resetContributions', async () => {
			const interaction = createInteraction('reset')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.resetContributions).toHaveBeenCalledWith(
				'guild-123',
			)
		})

		it('returns warning embed', async () => {
			const interaction = createInteraction('reset')

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(interactionReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					interaction,
					content: expect.objectContaining({
						embeds: expect.any(Array),
					}),
				}),
			)
			expect(createWarningEmbedMock).toHaveBeenCalledWith(
				expect.stringContaining('reset'),
				expect.any(String),
			)
		})
	})

	describe('guild validation', () => {
		it('rejects interaction without guild', async () => {
			const interaction = createInteraction('status')
			requireGuildMock.mockResolvedValue(false)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(requireGuildMock).toHaveBeenCalledWith(interaction)
			expect(interactionReplyMock).not.toHaveBeenCalled()
			expect(collaborativePlaylistServiceMock.getState).not.toHaveBeenCalled()
		})

		it('returns early if guildId is null', async () => {
			const interaction = {
				guildId: null,
				options: {
					getString: jest.fn(() => 'status'),
					getInteger: jest.fn(() => null),
				},
			} as unknown as ChatInputCommandInteraction
			requireGuildMock.mockResolvedValue(true)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(requireGuildMock).toHaveBeenCalledWith(interaction)
			expect(interactionReplyMock).not.toHaveBeenCalled()
		})
	})

	describe('per_user_limit option handling', () => {
		it('passes limit when provided with enable', async () => {
			const interaction = createInteraction('enable', 7)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				true,
				7,
			)
		})

		it('passes undefined when limit not provided with enable', async () => {
			const interaction = createInteraction('enable', undefined)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				true,
				undefined,
			)
		})

		it('ignores limit with disable action', async () => {
			const interaction = createInteraction('disable', 10)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.setMode).toHaveBeenCalledWith(
				'guild-123',
				false,
			)
			// Does not pass the limit
		})

		it('ignores limit with status action', async () => {
			const interaction = createInteraction('status', 10)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(collaborativePlaylistServiceMock.getState).toHaveBeenCalledWith(
				'guild-123',
			)
		})

		it('ignores limit with reset action', async () => {
			const interaction = createInteraction('reset', 10)

			await playlistCommand.execute({
				interaction,
			} as any)

			expect(
				collaborativePlaylistServiceMock.resetContributions,
			).toHaveBeenCalledWith('guild-123')
		})
	})
})
