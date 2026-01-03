/**
 * End-to-End tests for complete user workflows
 * Testing real user scenarios from start to finish
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock all external dependencies
jest.mock('../../src/utils/music/enhancedSearch')
jest.mock('../../src/handlers/queueHandler')
jest.mock('../../src/utils/command/commandValidations')
jest.mock('../../src/services/SessionService')
jest.mock('../../src/services/RateLimitService')

describe('User Workflow E2E Tests', () => {
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
                skip: jest.fn(),
            },
            tracks: [],
            shuffle: jest.fn(),
            clear: jest.fn(),
            destroy: jest.fn(),
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

    describe('Complete Music Session Workflow', () => {
        it('should handle complete music session from play to leave', async () => {
            // Step 1: User joins voice channel and plays a song
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue('test song')

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

            // Step 2: User adds more songs to queue
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue('another song')

            const anotherTrack = { ...mockTrack, title: 'Another Song' }
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: [anotherTrack] },
            })

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.addTrack).toHaveBeenCalledWith(anotherTrack)

            // Step 3: User checks queue
            mockInteraction.commandName = 'queue'
            mockQueue.tracks = [mockTrack, anotherTrack]

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

            // Step 4: User pauses music
            mockInteraction.commandName = 'pause'
            const pauseCommand = await import(
                '../../src/functions/music/commands/pause'
            )
            await pauseCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.pause).toHaveBeenCalled()

            // Step 5: User resumes music
            mockInteraction.commandName = 'resume'
            const resumeCommand = await import(
                '../../src/functions/music/commands/resume'
            )
            await resumeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.resume).toHaveBeenCalled()

            // Step 6: User skips current song
            mockInteraction.commandName = 'skip'
            const skipCommand = await import(
                '../../src/functions/music/commands/skip'
            )
            await skipCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.skip).toHaveBeenCalled()

            // Step 7: User adjusts volume
            mockInteraction.commandName = 'volume'
            mockInteraction.options.getInteger.mockReturnValue(75)
            const volumeCommand = await import(
                '../../src/functions/music/commands/volume'
            )
            await volumeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.node.setVolume).toHaveBeenCalledWith(75)

            // Step 8: User leaves voice channel
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

    describe('Playlist Management Workflow', () => {
        it('should handle complete playlist management workflow', async () => {
            // Step 1: User plays a playlist
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue(
                'https://youtube.com/playlist?list=test',
            )

            const playlistTracks = Array.from({ length: 10 }, (_, i) => ({
                ...mockTrack,
                title: `Playlist Song ${i}`,
                url: `https://youtube.com/watch?v=test${i}`,
            }))

            const { enhancedYouTubeSearch } = await import(
                '../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: playlistTracks },
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

            expect(mockQueue.addTrack).toHaveBeenCalledTimes(10)

            // Step 2: User shuffles playlist
            mockInteraction.commandName = 'shuffle'
            mockQueue.tracks = playlistTracks

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

            // Step 3: User removes specific track
            mockInteraction.commandName = 'remove'
            mockInteraction.options.getInteger.mockReturnValue(5) // Remove track at position 5

            const removeCommand = await import(
                '../../src/functions/music/commands/remove'
            )
            await removeCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockQueue.removeTrack).toHaveBeenCalledWith(4) // 0-indexed

            // Step 4: User clears entire queue
            mockInteraction.commandName = 'clear'
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

    describe('Download Workflow', () => {
        it('should handle complete download workflow', async () => {
            // Step 1: User downloads a video
            mockInteraction.commandName = 'download'
            mockInteraction.options.getString.mockReturnValue(
                'https://youtube.com/watch?v=test',
            )
            mockInteraction.options.getBoolean.mockReturnValue(false) // Video download

            const { downloadVideo } = await import(
                '../../src/functions/download/utils/downloadVideo'
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: true,
                filePath: '/downloads/test.mp4',
            })

            const { generateFileName } = await import(
                '../../src/utils/misc/generateFileName'
            )
            ;(generateFileName as jest.Mock).mockReturnValue('test.mp4')

            const downloadCommand = await import(
                '../../src/functions/download/commands/download'
            )
            await downloadCommand.default.executeDownload({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(downloadVideo).toHaveBeenCalled()
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining(
                                    'Download Complete',
                                ),
                            }),
                        }),
                    ]),
                }),
            )

            // Step 2: User downloads audio only
            mockInteraction.options.getString.mockReturnValue(
                'https://youtube.com/watch?v=test2',
            )
            mockInteraction.options.getBoolean.mockReturnValue(true) // Audio only

            const { downloadAudio } = await import(
                '../../src/functions/download/utils/downloadAudio'
            )
            ;(downloadAudio as jest.Mock).mockResolvedValue({
                success: true,
                filePath: '/downloads/test2.mp3',
            })
            ;(generateFileName as jest.Mock).mockReturnValue('test2.mp3')

            await downloadCommand.default.executeDownload({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(downloadAudio).toHaveBeenCalled()
        })
    })

    describe('Error Recovery Workflow', () => {
        it('should handle error recovery gracefully', async () => {
            // Step 1: Initial command fails
            mockInteraction.commandName = 'play'
            mockInteraction.options.getString.mockReturnValue('test song')

            const { enhancedYouTubeSearch } = await import(
                '../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as jest.Mock).mockRejectedValue(
                new Error('Search failed'),
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

            // Step 2: User tries again with different query
            mockInteraction.options.getString.mockReturnValue('different song')
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: [mockTrack] },
            })

            const { createQueue } = await import(
                '../../src/handlers/queueHandler'
            )
            ;(createQueue as jest.Mock).mockResolvedValue(mockQueue)

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Success'),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe('Multi-User Workflow', () => {
        it('should handle multiple users in same guild', async () => {
            const user1 = {
                ...mockInteraction,
                user: { id: 'user1', username: 'User1' },
            }

            const user2 = {
                ...mockInteraction,
                user: { id: 'user2', username: 'User2' },
            }

            // User 1 plays a song
            user1.commandName = 'play'
            user1.options.getString.mockReturnValue('song by user1')

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
                interaction: user1,
            })

            // User 2 adds another song
            user2.commandName = 'play'
            user2.options.getString.mockReturnValue('song by user2')

            const track2 = { ...mockTrack, title: 'Song by User2' }
            ;(enhancedYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                result: { tracks: [track2] },
            })

            await playCommand.default.execute({
                client: mockClient,
                interaction: user2,
            })

            expect(mockQueue.addTrack).toHaveBeenCalledWith(track2)

            // Both users can see the queue
            const { requireQueue } = await import(
                '../../src/utils/command/commandValidations'
            )
            ;(requireQueue as jest.Mock).mockReturnValue({ success: true })

            mockQueue.tracks = [mockTrack, track2]

            const queueCommand = await import(
                '../../src/functions/music/commands/queue'
            )
            await queueCommand.default.execute({
                client: mockClient,
                interaction: user1,
            })

            await queueCommand.default.execute({
                client: mockClient,
                interaction: user2,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledTimes(2)
        })
    })
})
