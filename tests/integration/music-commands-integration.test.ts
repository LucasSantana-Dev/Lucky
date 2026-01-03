/**
 * Integration tests for all music commands
 * Testing complete music command workflows
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock dependencies
jest.mock('../../src/utils/music/enhancedSearch')
jest.mock('../../src/handlers/queueHandler')
jest.mock('../../src/utils/command/commandValidations')

describe('Music Commands Integration', () => {
    let mockInteraction: any
    let mockClient: any
    let mockQueue: any
    let mockTrack: any

    beforeEach(() => {
        jest.clearAllMocks()

        // Mock interaction
        mockInteraction = {
            user: { id: 'user123', username: 'TestUser' },
            guild: { id: 'guild123' },
            channel: { id: 'channel123' },
            member: {
                voice: { channel: { id: 'voice123' } },
            },
            options: {
                getString: jest.fn(),
                getInteger: jest.fn(),
                getBoolean: jest.fn(),
                getNumber: jest.fn(),
            },
            deferReply: jest.fn().mockResolvedValue(undefined),
            editReply: jest.fn().mockResolvedValue(undefined),
            followUp: jest.fn().mockResolvedValue(undefined),
        }

        // Mock client
        mockClient = {
            user: { id: 'bot123' },
            player: {
                search: jest.fn(),
                play: jest.fn(),
            },
        }

        // Mock queue
        mockQueue = {
            addTrack: jest.fn(),
            node: {
                play: jest.fn(),
                pause: jest.fn(),
                resume: jest.fn(),
                stop: jest.fn(),
                setVolume: jest.fn(),
            },
            tracks: [],
            guild: { id: 'guild123' },
            metadata: {
                channel: { id: 'channel123' },
                client: mockClient,
                requestedBy: mockInteraction.user,
            },
        }

        // Mock track
        mockTrack = {
            title: 'Test Song',
            author: 'Test Artist',
            url: 'https://youtube.com/watch?v=test',
            duration: '3:45',
            thumbnail: 'https://img.youtube.com/test.jpg',
        }
    })

    describe('Play Command Integration', () => {
        it('should handle successful track play', async () => {
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue('test query')

            const { enhancedYouTubeSearch } = await import(
                '../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: [mockTrack] },
            })

            const { createQueue } = await import(
                '../../src/handlers/queueHandler'
            )
            ;(createQueue as jest.Mock).mockResolvedValue(mockQueue)

            const playCommand = await import(
                '../../src/functions/music/commands/play'
            )

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(enhancedYouTubeSearch).toHaveBeenCalled()
        })

        it('should handle playlist play', async () => {
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue(
                'https://youtube.com/playlist?list=test',
            )

            const { enhancedYouTubeSearch } = await import(
                '../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: [mockTrack, mockTrack, mockTrack] },
            })

            const { createQueue } = await import(
                '../../src/handlers/queueHandler'
            )
            ;(createQueue as jest.Mock).mockResolvedValue(mockQueue)

            const playCommand = await import(
                '../../src/functions/music/commands/play'
            )

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.addTrack).toHaveBeenCalledTimes(3)
        })
    })

    describe('Queue Command Integration', () => {
        it('should display current queue', async () => {
            mockInteraction.commandName = 'queue'
            mockQueue.tracks = [mockTrack, mockTrack]

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const queueCommand = await import(
                '../../src/functions/music/commands/queue'
            )

            await queueCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Queue'),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it('should handle empty queue', async () => {
            mockInteraction.commandName = 'queue'
            mockQueue.tracks = []

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const queueCommand = await import(
                '../../src/functions/music/commands/queue'
            )

            await queueCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description: expect.stringContaining('empty'),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe('Skip Command Integration', () => {
        it('should skip current track', async () => {
            mockInteraction.commandName = 'skip'

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const skipCommand = await import(
                '../../src/functions/music/commands/skip'
            )

            await skipCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.skip).toHaveBeenCalled()
        })

        it('should handle skip with no next track', async () => {
            mockInteraction.commandName = 'skip'
            mockQueue.tracks = []

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const skipCommand = await import(
                '../../src/functions/music/commands/skip'
            )

            await skipCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining('No more tracks'),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe('Pause/Resume Command Integration', () => {
        it('should pause music', async () => {
            mockInteraction.commandName = 'pause'

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const pauseCommand = await import(
                '../../src/functions/music/commands/pause'
            )

            await pauseCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.pause).toHaveBeenCalled()
        })

        it('should resume music', async () => {
            mockInteraction.commandName = 'resume'

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const resumeCommand = await import(
                '../../src/functions/music/commands/resume'
            )

            await resumeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.resume).toHaveBeenCalled()
        })
    })

    describe('Volume Command Integration', () => {
        it('should set volume', async () => {
            mockInteraction.commandName = 'volume'
            mockInteraction.options.getInteger.mockReturnValue(75)

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const volumeCommand = await import(
                '../../src/functions/music/commands/volume'
            )

            await volumeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.setVolume).toHaveBeenCalledWith(75)
        })

        it('should handle invalid volume', async () => {
            mockInteraction.commandName = 'volume'
            mockInteraction.options.getInteger.mockReturnValue(150) // Invalid

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const volumeCommand = await import(
                '../../src/functions/music/commands/volume'
            )

            await volumeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining('Invalid volume'),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe('Shuffle Command Integration', () => {
        it('should shuffle queue', async () => {
            mockInteraction.commandName = 'shuffle'
            mockQueue.tracks = [mockTrack, mockTrack, mockTrack]

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const shuffleCommand = await import(
                '../../src/functions/music/commands/shuffle'
            )

            await shuffleCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.shuffle).toHaveBeenCalled()
        })
    })

    describe('Clear Command Integration', () => {
        it('should clear queue', async () => {
            mockInteraction.commandName = 'clear'
            mockQueue.tracks = [mockTrack, mockTrack, mockTrack]

            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            const clearCommand = await import(
                '../../src/functions/music/commands/clear'
            )

            await clearCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.clear).toHaveBeenCalled()
        })
    })

    describe('Leave Command Integration', () => {
        it('should leave voice channel', async () => {
            mockInteraction.commandName = 'leave'

            const { requireGuild } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireGuild as jest.Mock).mockReturnValue({ success: true })

            const leaveCommand = await import(
                '../../src/functions/music/commands/leave'
            )

            await leaveCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.destroy).toHaveBeenCalled()
        })
    })

    describe('Error Handling Integration', () => {
        it('should handle validation failures', async () => {
            mockInteraction.commandName = 'play'
            mockInteraction.guild = null // Invalid guild

            const { requireGuild } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireGuild as jest.Mock).mockReturnValue({
                success: false,
                error: 'This command must be used in a server',
            })

            const playCommand = await import(
                '../../src/functions/music/commands/play'
            )

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Error'),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it('should handle queue creation failures', async () => {
            mockInteraction.commandName = 'play'

            const { createQueue } = await import(
                '../../src/handlers/queueHandler'
            )
            ;(createQueue as jest.Mock).mockRejectedValue(
                new Error('Queue creation failed'),
            )

            const playCommand = await import(
                '../../src/functions/music/commands/play'
            )

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Error'),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })
})
