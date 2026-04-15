import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track } from 'discord-player'
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { handlePlay } from './handlePlay'

const searchContentOnYoutubeMock = jest.fn()
const interactionReplyMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('../../../../utils/music/search/searchContentOnYoutube', () => ({
    searchContentOnYoutube: (...args: unknown[]) =>
        searchContentOnYoutubeMock(...args),
}))

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        createUserFriendlyErrorMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../../utils/general/messages', () => ({
    messages: {
        error: {
            noQuery: '❌ You need to provide a search term or URL.',
            noResult: '❌ No results found.',
        },
    },
}))

function createEmbed(overrides: Partial<EmbedBuilder> = {}): EmbedBuilder {
    return {
        setColor: jest.fn(function (this: EmbedBuilder) {
            return this
        }),
        setDescription: jest.fn(function (this: EmbedBuilder) {
            return this
        }),
        setThumbnail: jest.fn(function (this: EmbedBuilder) {
            return this
        }),
        ...overrides,
    } as unknown as EmbedBuilder
}

function createInteraction(
    query: string | null = null,
): ChatInputCommandInteraction {
    return {
        options: {
            getString: jest.fn((_option) => query),
        },
    } as unknown as ChatInputCommandInteraction
}

function createClient() {
    return {
        player: {},
    } as unknown as any
}

function createQueue() {
    return {
        addTrack: jest.fn(),
    }
}

describe('handlePlay', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        searchContentOnYoutubeMock.mockClear()
        interactionReplyMock.mockClear()
        createUserFriendlyErrorMock.mockClear()
        errorLogMock.mockClear()
    })

    describe('validateQuery', () => {
        it('rejects null query', async () => {
            const embed = createEmbed()
            const interaction = createInteraction(null)
            const client = createClient()
            const queue = createQueue()

            await handlePlay({ client, interaction, queue, embed })

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    interaction,
                    content: {
                        embeds: [embed],
                    },
                }),
            )
            expect(embed.setColor).toHaveBeenCalledWith('Red')
            expect(embed.setDescription).toHaveBeenCalledWith(
                '❌ You need to provide a search term or URL.',
            )
        })

        it('rejects empty string query', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('')
            const client = createClient()
            const queue = createQueue()

            await handlePlay({ client, interaction, queue, embed })

            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    interaction,
                    content: {
                        embeds: [embed],
                    },
                }),
            )
            expect(embed.setColor).toHaveBeenCalledWith('Red')
        })

        it('rejects undefined query', async () => {
            const embed = createEmbed()
            const interaction = createInteraction(undefined as any)
            const client = createClient()
            const queue = createQueue()

            await handlePlay({ client, interaction, queue, embed })

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(embed.setColor).toHaveBeenCalledWith('Red')
        })
    })

    describe('searchAndAddTrack', () => {
        it('successfully searches and adds a track to queue', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test song')
            const client = createClient()
            const queue = createQueue()

            const mockTrack = {
                title: 'Test Song',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: 'https://img.youtube.com/vi/test/maxresdefault.jpg',
                duration: 180000,
            }

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: [mockTrack],
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(searchContentOnYoutubeMock).toHaveBeenCalledWith({
                client,
                searchTerms: 'test song',
                interaction,
            })

            expect(queue.addTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: mockTrack.title,
                    url: mockTrack.url,
                    thumbnail: mockTrack.thumbnail,
                    duration: mockTrack.duration,
                }),
            )

            expect(embed.setColor).toHaveBeenCalledWith('Green')
            expect(embed.setDescription).toHaveBeenCalledWith(
                '✅ Added to queue: **Test Song**',
            )
            expect(embed.setThumbnail).toHaveBeenCalledWith(mockTrack.thumbnail)
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    interaction,
                    content: { embeds: [embed] },
                }),
            )
        })

        it('logs query to error log', async () => {
            const embed = createEmbed()
            const query = 'test query'
            const interaction = createInteraction(query)
            const client = createClient()
            const queue = createQueue()

            const mockTrack = {
                title: 'Test Song',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: 'https://img.youtube.com/vi/test/maxresdefault.jpg',
                duration: 180000,
            }

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: [mockTrack],
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(errorLogMock).toHaveBeenCalledWith({
                message: `Query: ${query}`,
            })
        })

        it('handles empty search results', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('nonexistent song')
            const client = createClient()
            const queue = createQueue()

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: [],
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(embed.setColor).toHaveBeenCalledWith('Red')
            expect(embed.setDescription).toHaveBeenCalledWith(
                '❌ No results found.',
            )
            expect(queue.addTrack).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('handles null search result', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            searchContentOnYoutubeMock.mockResolvedValue(null)

            await handlePlay({ client, interaction, queue, embed })

            expect(embed.setColor).toHaveBeenCalledWith('Red')
            expect(embed.setDescription).toHaveBeenCalledWith(
                '❌ No results found.',
            )
            expect(queue.addTrack).not.toHaveBeenCalled()
        })

        it('uses first track when multiple results are found', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            const mockTracks = [
                {
                    title: 'First Track',
                    url: 'https://youtube.com/watch?v=first',
                    thumbnail:
                        'https://img.youtube.com/vi/first/maxresdefault.jpg',
                    duration: 180000,
                },
                {
                    title: 'Second Track',
                    url: 'https://youtube.com/watch?v=second',
                    thumbnail:
                        'https://img.youtube.com/vi/second/maxresdefault.jpg',
                    duration: 240000,
                },
            ]

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: mockTracks,
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(queue.addTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: mockTracks[0].title,
                    url: mockTracks[0].url,
                }),
            )
            expect(embed.setDescription).toHaveBeenCalledWith(
                '✅ Added to queue: **First Track**',
            )
        })

        it('handles undefined search result tracks', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: undefined,
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(embed.setColor).toHaveBeenCalledWith('Red')
            expect(embed.setDescription).toHaveBeenCalledWith(
                '❌ No results found.',
            )
            expect(queue.addTrack).not.toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        it('catches search errors and displays user-friendly message', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            const searchError = new Error('Network error')
            searchContentOnYoutubeMock.mockRejectedValue(searchError)
            createUserFriendlyErrorMock.mockReturnValue(
                'Network connection failed. Please try again.',
            )

            await handlePlay({ client, interaction, queue, embed })

            expect(errorLogMock).toHaveBeenCalledWith({
                message: `Error in handlePlay: ${searchError}`,
            })
            expect(createUserFriendlyErrorMock).toHaveBeenCalledWith(
                searchError,
            )
            expect(embed.setColor).toHaveBeenCalledWith('Red')
            expect(embed.setDescription).toHaveBeenCalledWith(
                'Network connection failed. Please try again.',
            )
            expect(interactionReplyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    interaction,
                    content: {
                        embeds: [embed],
                    },
                }),
            )
        })

        it('handles unknown error types', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            const unknownError = {
                code: 'UNKNOWN',
                message: 'Something went wrong',
            }
            searchContentOnYoutubeMock.mockRejectedValue(unknownError)
            createUserFriendlyErrorMock.mockReturnValue('An error occurred.')

            await handlePlay({ client, interaction, queue, embed })

            expect(errorLogMock).toHaveBeenCalled()
            expect(createUserFriendlyErrorMock).toHaveBeenCalledWith(
                unknownError,
            )
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('sanitizes errors before displaying', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            const technicalError = new Error('ffmpeg failed to initialize')
            searchContentOnYoutubeMock.mockRejectedValue(technicalError)
            createUserFriendlyErrorMock.mockReturnValue(
                'Audio processing is unavailable. Please try again later.',
            )

            await handlePlay({ client, interaction, queue, embed })

            expect(createUserFriendlyErrorMock).toHaveBeenCalledWith(
                technicalError,
            )
            expect(embed.setDescription).toHaveBeenCalledWith(
                'Audio processing is unavailable. Please try again later.',
            )
        })

        it('does not add track to queue when error occurs', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            searchContentOnYoutubeMock.mockRejectedValue(
                new Error('Search failed'),
            )
            createUserFriendlyErrorMock.mockReturnValue('Search failed.')

            await handlePlay({ client, interaction, queue, embed })

            expect(queue.addTrack).not.toHaveBeenCalled()
        })
    })

    describe('integration scenarios', () => {
        it('handles full successful flow with query validation', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('taylor swift')
            const client = createClient()
            const queue = createQueue()

            const mockTrack = {
                title: 'Blank Space',
                url: 'https://youtube.com/watch?v=e-ORMU3nJoI',
                thumbnail:
                    'https://img.youtube.com/vi/e-ORMU3nJoI/maxresdefault.jpg',
                duration: 231000,
            }

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: [mockTrack],
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(errorLogMock).toHaveBeenCalledWith({
                message: 'Query: taylor swift',
            })
            expect(searchContentOnYoutubeMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    searchTerms: 'taylor swift',
                }),
            )
            expect(queue.addTrack).toHaveBeenCalled()
            expect(embed.setColor).toHaveBeenCalledWith('Green')
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('returns early when query validation fails', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('')
            const client = createClient()
            const queue = createQueue()

            await handlePlay({ client, interaction, queue, embed })

            expect(searchContentOnYoutubeMock).not.toHaveBeenCalled()
            expect(queue.addTrack).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('properly chains embed modifications', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('test')
            const client = createClient()
            const queue = createQueue()

            const mockTrack = {
                title: 'Test Track',
                url: 'https://youtube.com/watch?v=test',
                thumbnail: 'https://img.youtube.com/vi/test/maxresdefault.jpg',
                duration: 200000,
            }

            searchContentOnYoutubeMock.mockResolvedValue({
                tracks: [mockTrack],
            })

            await handlePlay({ client, interaction, queue, embed })

            expect(embed.setColor).toHaveBeenCalledWith('Green')
            expect(embed.setDescription).toHaveBeenCalledWith(
                expect.stringContaining('Added to queue'),
            )
            expect(embed.setThumbnail).toHaveBeenCalledWith(mockTrack.thumbnail)
        })

        it('handles whitespace-only query as invalid', async () => {
            const embed = createEmbed()
            const interaction = createInteraction('   ')
            const client = createClient()
            const queue = createQueue()

            await handlePlay({ client, interaction, queue, embed })

            expect(searchContentOnYoutubeMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    searchTerms: '   ',
                }),
            )
        })
    })
})
