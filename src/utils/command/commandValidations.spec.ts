import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { requireGuild, requireVoiceChannel, requireQueue, requireCurrentTrack, requireIsPlaying, requireInteractionOptions } from './commandValidations'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import type { GuildQueue } from 'discord-player'

// Mock the dependencies
jest.mock('../general/embeds', () => ({
    errorEmbed: jest.fn((title: string, message: string) => ({
        data: { title, description: message }
    }))
}))

jest.mock('../general/interactionReply', () => ({
    interactionReply: jest.fn()
}))

jest.mock('../error/errorHandler', () => ({
    handleError: jest.fn((error: Error) => error),
    createUserErrorMessage: jest.fn((error: Error) => error.message)
}))

describe('Command Validations', () => {
    let mockInteraction: ChatInputCommandInteraction
    let mockMember: GuildMember
    let mockQueue: GuildQueue

    beforeEach(() => {
        jest.clearAllMocks()

        mockMember = {
            voice: {
                channel: { id: 'voice-channel-123' }
            }
        } as any

        mockQueue = {
            currentTrack: { title: 'Test Track' },
            isPlaying: jest.fn().mockReturnValue(true)
        } as any

        mockInteraction = {
            guildId: 'guild-123',
            user: { id: 'user-123' },
            member: mockMember,
            options: {
                getSubcommand: jest.fn().mockReturnValue('play')
            }
        } as any
    })

    describe('requireGuild', () => {
        it('should return true when guild exists', async () => {
            const result = await requireGuild(mockInteraction)
            expect(result).toBe(true)
        })

        it('should return false when guild does not exist', async () => {
            mockInteraction.guildId = null
            const result = await requireGuild(mockInteraction)
            expect(result).toBe(false)
        })
    })

    describe('requireVoiceChannel', () => {
        it('should return true when user is in voice channel', async () => {
            const result = await requireVoiceChannel(mockInteraction)
            expect(result).toBe(true)
        })

        it('should return false when user is not in voice channel', async () => {
            const mockInteractionWithoutVoice = {
                ...mockInteraction,
                member: { voice: null } as any
            } as any
            const result = await requireVoiceChannel(mockInteractionWithoutVoice)
            expect(result).toBe(false)
        })
    })

    describe('requireQueue', () => {
        it('should return true when queue exists', async () => {
            const result = await requireQueue(mockQueue, mockInteraction)
            expect(result).toBe(true)
        })

        it('should return false when queue does not exist', async () => {
            const result = await requireQueue(null, mockInteraction)
            expect(result).toBe(false)
        })
    })

    describe('requireCurrentTrack', () => {
        it('should return true when current track exists', async () => {
            const result = await requireCurrentTrack(mockQueue, mockInteraction)
            expect(result).toBe(true)
        })

        it('should return false when current track does not exist', async () => {
            const mockQueueWithoutTrack = {
                ...mockQueue,
                currentTrack: null
            } as any
            const result = await requireCurrentTrack(mockQueueWithoutTrack, mockInteraction)
            expect(result).toBe(false)
        })
    })

    describe('requireIsPlaying', () => {
        it('should return true when music is playing', async () => {
            const result = await requireIsPlaying(mockQueue, mockInteraction)
            expect(result).toBe(true)
        })

        it('should return false when music is not playing', async () => {
            const mockQueueNotPlaying = {
                ...mockQueue,
                isPlaying: jest.fn().mockReturnValue(false)
            } as any
            const result = await requireIsPlaying(mockQueueNotPlaying, mockInteraction)
            expect(result).toBe(false)
        })
    })

    describe('requireInteractionOptions', () => {
        it('should return true when subcommand is valid', async () => {
            const result = await requireInteractionOptions(mockInteraction, ['play', 'pause'])
            expect(result).toBe(true)
        })

        it('should return false when subcommand is invalid', async () => {
            const result = await requireInteractionOptions(mockInteraction, ['pause', 'stop'])
            expect(result).toBe(false)
        })
    })
})
