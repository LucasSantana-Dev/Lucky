import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import type {
    ChatInputCommandInteraction,
    VoiceChannel,
    GuildMember,
} from 'discord.js'
import type { GuildQueue } from 'discord-player'
import type { CustomClient } from '../types'
import { createQueue, queueConnect } from './queueHandler'

function createMockInteraction(
    overrides?: Partial<ChatInputCommandInteraction>,
): ChatInputCommandInteraction {
    return {
        guild: {
            id: 'guild-1',
        },
        user: {
            id: 'user-1',
        },
        channel: {
            id: 'channel-1',
        },
        member: {
            voice: {
                channel: {
                    id: 'voice-channel-1',
                },
            },
        },
        ...overrides,
    } as any
}

function createMockClient(overrides?: Partial<CustomClient>): CustomClient {
    return {
        player: {
            nodes: {
                create: jest.fn().mockReturnValue({
                    setRepeatMode: jest.fn(),
                    connection: null,
                    connect: jest.fn().mockResolvedValue(undefined),
                }),
            },
        },
        ...overrides,
    } as any
}

function createMockQueue(overrides?: Partial<GuildQueue>): GuildQueue {
    return {
        connection: null,
        connect: jest.fn().mockResolvedValue(undefined),
        setRepeatMode: jest.fn(),
        ...overrides,
    } as any
}

describe('queueHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('createQueue', () => {
        it('should create a queue successfully', async () => {
            const interaction = createMockInteraction()
            const client = createMockClient()

            const queue = await createQueue({ client, interaction })

            expect(client.player.nodes.create).toHaveBeenCalledWith(
                interaction.guild,
            )
            expect(queue).toBeDefined()
        })

        it('should enable autoplay by default', async () => {
            const interaction = createMockInteraction()
            const mockQueue = createMockQueue()
            const client = createMockClient({
                player: {
                    nodes: {
                        create: jest.fn().mockReturnValue(mockQueue),
                    },
                },
            } as any)

            await createQueue({ client, interaction })

            expect(mockQueue.setRepeatMode).toHaveBeenCalledWith(3)
        })

        it('should throw ValidationError when guild is missing', async () => {
            const interaction = createMockInteraction({ guild: null })
            const client = createMockClient()

            await expect(createQueue({ client, interaction })).rejects.toThrow(
                'Guild not found in interaction',
            )
        })

        it('should include details in ValidationError', async () => {
            const interaction = createMockInteraction({ guild: null })
            const client = createMockClient()

            try {
                await createQueue({ client, interaction })
            } catch (error: any) {
                expect(error.name).toBe('ValidationError')
                expect(error.details).toBeDefined()
                expect(error.details.userId).toBe('user-1')
                expect(error.details.channelId).toBe('channel-1')
            }
        })

        it('should handle interaction without user', async () => {
            const interaction = createMockInteraction({
                guild: null,
                user: undefined,
            })
            const client = createMockClient()

            try {
                await createQueue({ client, interaction })
            } catch (error: any) {
                expect(error.details.userId).toBeUndefined()
            }
        })

        it('should handle interaction without channel', async () => {
            const interaction = createMockInteraction({
                guild: null,
                channel: undefined,
            })
            const client = createMockClient()

            try {
                await createQueue({ client, interaction })
            } catch (error: any) {
                expect(error.details.channelId).toBeUndefined()
            }
        })
    })

    describe('queueConnect', () => {
        it('should connect queue to voice channel', async () => {
            const mockVoiceChannel = { id: 'voice-channel-1' } as VoiceChannel
            const interaction = createMockInteraction({
                member: {
                    voice: {
                        channel: mockVoiceChannel,
                    },
                } as GuildMember,
            })
            const queue = createMockQueue()

            await queueConnect({ queue, interaction })

            expect(queue.connect).toHaveBeenCalledWith(mockVoiceChannel)
        })

        it('should not connect if queue already has connection', async () => {
            const mockConnection = { id: 'connection-1' }
            const queue = createMockQueue({
                connection: mockConnection as any,
            })
            const interaction = createMockInteraction()

            await queueConnect({ queue, interaction })

            expect(queue.connect).not.toHaveBeenCalled()
        })

        it('should handle multiple connection attempts', async () => {
            const queue = createMockQueue()
            const interaction = createMockInteraction()

            await queueConnect({ queue, interaction })
            queue.connection = { id: 'connection-1' } as any
            await queueConnect({ queue, interaction })

            expect(queue.connect).toHaveBeenCalledTimes(1)
        })

        it('should extract voice channel from member', async () => {
            const mockVoiceChannel = {
                id: 'voice-channel-1',
                name: 'General',
            } as VoiceChannel
            const mockMember = {
                voice: {
                    channel: mockVoiceChannel,
                },
            } as GuildMember
            const interaction = createMockInteraction({
                member: mockMember,
            })
            const queue = createMockQueue()

            await queueConnect({ queue, interaction })

            expect(queue.connect).toHaveBeenCalledWith(mockVoiceChannel)
        })
    })

    describe('ValidationError', () => {
        it('should create error with message and details', async () => {
            const interaction = createMockInteraction({ guild: null })
            const client = createMockClient()

            try {
                await createQueue({ client, interaction })
                expect(true).toBe(false)
            } catch (error: any) {
                expect(error).toBeInstanceOf(Error)
                expect(error.name).toBe('ValidationError')
                expect(error.message).toBe('Guild not found in interaction')
                expect(error.details).toEqual({
                    userId: 'user-1',
                    channelId: 'channel-1',
                })
            }
        })

        it('should work without details', async () => {
            const interaction = createMockInteraction({ guild: null })
            const client = createMockClient()

            try {
                await createQueue({ client, interaction })
            } catch (error: any) {
                expect(error.name).toBe('ValidationError')
                expect(error.details).toBeDefined()
            }
        })
    })
})
