/**
 * Integration tests for play command
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { ChatInputCommandInteraction } from 'discord.js'
import { Track, GuildQueue } from 'discord-player'

// Mock dependencies
jest.mock('../../../src/utils/music/enhancedSearch')
jest.mock('../../../src/utils/search/searchContentOnYoutube')
jest.mock('../../../src/handlers/queueHandler')

describe('Play Command Integration', () => {
    let mockInteraction: jest.Mocked<ChatInputCommandInteraction>
    let mockClient: any
    let mockQueue: jest.Mocked<GuildQueue>
    let mockTrack: jest.Mocked<Track>

    beforeEach(() => {
        jest.clearAllMocks()

        // Mock interaction
        mockInteraction = {
            user: { id: 'user123', username: 'TestUser' },
            guild: { id: 'guild123' },
            channel: { id: 'channel123' },
            commandName: 'play',
            options: {
                getString: jest.fn().mockReturnValue('test query'),
            },
            deferReply: jest.fn(),
            editReply: jest.fn(),
            followUp: jest.fn(),
        } as any

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
            },
            guild: { id: 'guild123' },
            metadata: {
                channel: { id: 'channel123' },
                client: mockClient,
                requestedBy: mockInteraction.user,
            },
        } as any

        // Mock track
        mockTrack = {
            title: 'Test Song',
            author: 'Test Artist',
            url: 'https://youtube.com/watch?v=test',
            duration: '3:45',
            thumbnail: 'https://img.youtube.com/test.jpg',
        } as any
    })

    describe('Play command execution', () => {
        it('should handle successful track search and play', async () => {
            // Mock successful search
            const mockSearchResult = {
                success: true,
                result: {
                    tracks: [mockTrack],
                },
            }

            const { enhancedYouTubeSearch } = await import(
                '../../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as any).mockResolvedValue(
                mockSearchResult,
            )

            // Mock queue creation
            const { createQueue } = await import(
                '../../../src/handlers/queueHandler'
            )
            ;(createQueue as any).mockResolvedValue(mockQueue)

            // Import and execute play command
            const playCommand = await import(
                '../../../src/functions/music/commands/play'
            )

            await playCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(enhancedYouTubeSearch).toHaveBeenCalledWith(
                mockClient.player,
                'test query',
                mockInteraction.user,
                false,
            )
        })

        it('should handle search failures gracefully', async () => {
            const mockSearchResult = {
                success: false,
                error: 'Search failed',
            }

            const { enhancedYouTubeSearch } = await import(
                '../../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as any).mockResolvedValue(
                mockSearchResult,
            )

            const playCommand = await import(
                '../../../src/functions/music/commands/play'
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
            const { createQueue } = await import(
                '../../../src/handlers/queueHandler'
            )
            ;(createQueue as any).mockRejectedValue(
                new Error('Queue creation failed'),
            )

            const playCommand = await import(
                '../../../src/functions/music/commands/play'
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

        it('should handle different query types', async () => {
            const testCases = [
                { query: 'https://youtube.com/watch?v=test', type: 'URL' },
                { query: 'search term', type: 'Search' },
                {
                    query: 'https://open.spotify.com/track/test',
                    type: 'Spotify URL',
                },
            ]

            for (const testCase of testCases) {
                mockInteraction.options.getString.mockReturnValue(
                    testCase.query,
                )

                const { enhancedYouTubeSearch } = await import(
                    '../../../src/utils/music/enhancedSearch'
                )
            ;(enhancedYouTubeSearch as any).mockResolvedValue({
                success: true,
                result: { tracks: [mockTrack] },
            })

                const { createQueue } = await import(
                    '../../../src/handlers/queueHandler'
                )
                ;(createQueue as any).mockResolvedValue(mockQueue)

                const playCommand = await import(
                    '../../../src/functions/music/commands/play'
                )

                await playCommand.default.execute({
                    client: mockClient,
                    interaction: mockInteraction,
                })

                expect(enhancedYouTubeSearch).toHaveBeenCalledWith(
                    mockClient.player,
                    testCase.query,
                    mockInteraction.user,
                    false,
                )
            }
        })
    })

    describe('Error handling', () => {
        it('should handle network timeouts', async () => {
            const { enhancedYouTubeSearch } = await import(
                '../../../src/utils/music/enhancedSearch'
            )
            ;(enhancedYouTubeSearch as any).mockRejectedValue(
                new Error('Network timeout'),
            )

            const playCommand = await import(
                '../../../src/functions/music/commands/play'
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

        it('should handle invalid guild context', async () => {
            ;(mockInteraction as any).guild = null

            const playCommand = await import(
                '../../../src/functions/music/commands/play'
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

    describe('Command validation', () => {
        it('should validate required parameters', async () => {
            mockInteraction.options.getString.mockReturnValue(null)

            const playCommand = await import(
                '../../../src/functions/music/commands/play'
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
