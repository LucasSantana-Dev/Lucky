import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import {
    createTrackEmbed,
    createQueueEmbed,
    musicEmbed,
    queueEmbed,
    autoplayEmbed,
} from './musicEmbeds'
import { EMBED_COLORS, EMOJIS } from './constants'

jest.mock('discord', () => ({
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        setThumbnail: jest.fn().mockReturnThis(),
        setURL: jest.fn().mockReturnThis(),
        setAuthor: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
        data: {},
    })),
}))

describe('musicEmbeds', () => {
    let mockEmbed: {
        setTitle: ReturnType<typeof jest.fn>
        setDescription: ReturnType<typeof jest.fn>
        setColor: ReturnType<typeof jest.fn>
        setThumbnail: ReturnType<typeof jest.fn>
        setURL: ReturnType<typeof jest.fn>
        setAuthor: ReturnType<typeof jest.fn>
        addFields: ReturnType<typeof jest.fn>
        setFooter: ReturnType<typeof jest.fn>
        setTimestamp: ReturnType<typeof jest.fn>
        data: object
    }

    beforeEach(() => {
        mockEmbed = {
            setTitle: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setDescription: jest.fn().mockReturnThis() as ReturnType<
                typeof jest.fn
            >,
            setColor: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setThumbnail: jest.fn().mockReturnThis() as ReturnType<
                typeof jest.fn
            >,
            setURL: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setAuthor: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            addFields: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setFooter: jest.fn().mockReturnThis() as ReturnType<typeof jest.fn>,
            setTimestamp: jest.fn().mockReturnThis() as ReturnType<
                typeof jest.fn
            >,
            data: {},
        }
        const { EmbedBuilder } = require('discord') as {
            EmbedBuilder: jest.Mock
        }
        EmbedBuilder.mockImplementation(() => mockEmbed)
    })

    describe('musicEmbed', () => {
        it('creates with title and description', () => {
            musicEmbed('Now Playing', 'Some track')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.MUSIC} Now Playing`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith('Some track')
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.MUSIC)
        })

        it('creates without description', () => {
            musicEmbed('Now Playing')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.MUSIC} Now Playing`,
            )
            expect(mockEmbed.setDescription).not.toHaveBeenCalled()
        })
    })

    describe('queueEmbed', () => {
        it('creates with title and description', () => {
            queueEmbed('Queue', 'Track list')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.QUEUE} Queue`,
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.QUEUE)
        })

        it('creates without description', () => {
            queueEmbed('Queue')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.QUEUE} Queue`,
            )
        })
    })

    describe('autoplayEmbed', () => {
        it('creates with title and description', () => {
            autoplayEmbed('Autoplay', 'Enabled')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.AUTOPLAY} Autoplay`,
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(
                EMBED_COLORS.AUTOPLAY,
            )
        })

        it('creates without description', () => {
            autoplayEmbed('Autoplay')
            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.AUTOPLAY} Autoplay`,
            )
        })
    })

    describe('createTrackEmbed', () => {
        it('creates with required fields', () => {
            createTrackEmbed({
                title: 'Test Track',
                author: 'Test Artist',
                url: 'https://example.com/track',
            })

            expect(mockEmbed.setTitle).toHaveBeenCalledWith(
                `${EMOJIS.MUSIC} Test Track`,
            )
            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'by Test Artist',
            )
            expect(mockEmbed.setURL).toHaveBeenCalledWith(
                'https://example.com/track',
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.MUSIC)
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })

        it('includes duration and requestedBy fields', () => {
            createTrackEmbed({
                title: 'Track',
                author: 'Artist',
                url: 'https://example.com',
                duration: '3:45',
                requestedBy: 'User#1234',
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Duration',
                        value: '3:45',
                    }),
                    expect.objectContaining({
                        name: 'Requested by',
                        value: 'User#1234',
                    }),
                ]),
            )
        })

        it('uses Unknown for missing duration', () => {
            createTrackEmbed({
                title: 'Track',
                author: 'Artist',
                url: 'https://example.com',
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Duration',
                        value: 'Unknown',
                    }),
                    expect.objectContaining({
                        name: 'Requested by',
                        value: 'Unknown',
                    }),
                ]),
            )
        })

        it('sets thumbnail when provided', () => {
            createTrackEmbed({
                title: 'Track',
                author: 'Artist',
                url: 'https://example.com',
                thumbnail: 'https://example.com/thumb.jpg',
            })

            expect(mockEmbed.setThumbnail).toHaveBeenCalledWith(
                'https://example.com/thumb.jpg',
            )
        })

        it('adds source field when provided', () => {
            createTrackEmbed({
                title: 'Track',
                author: 'Artist',
                url: 'https://example.com',
                source: 'YouTube',
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Source',
                        value: 'YouTube',
                    }),
                ]),
            )
        })

        it('does not add source field when absent', () => {
            createTrackEmbed({
                title: 'Track',
                author: 'Artist',
                url: 'https://example.com',
            })

            const calls = (mockEmbed.addFields as ReturnType<typeof jest.fn>)
                .mock.calls
            const allFields = calls.flatMap(
                (c: unknown[]) => c[0] as { name: string }[],
            )
            const sourceField = allFields.find((f) => f.name === 'Source')
            expect(sourceField).toBeUndefined()
        })
    })

    describe('createQueueEmbed', () => {
        it('shows empty queue message when no tracks', () => {
            createQueueEmbed({
                tracks: [],
            })

            expect(mockEmbed.setDescription).toHaveBeenCalledWith(
                'Queue is empty',
            )
            expect(mockEmbed.setColor).toHaveBeenCalledWith(EMBED_COLORS.QUEUE)
        })

        it('shows now playing when currentTrack is set', () => {
            createQueueEmbed({
                tracks: [],
                currentTrack: {
                    title: 'Current Track',
                    author: 'Artist',
                    url: 'https://example.com/current',
                },
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Now Playing',
                        value: '[Current Track](https://example.com/current)',
                    }),
                ]),
            )
        })

        it('shows track list when tracks present', () => {
            createQueueEmbed({
                tracks: [
                    {
                        title: 'Track 1',
                        author: 'A1',
                        url: 'https://example.com/1',
                    },
                    {
                        title: 'Track 2',
                        author: 'A2',
                        url: 'https://example.com/2',
                    },
                ],
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Queue (2 tracks)',
                    }),
                ]),
            )
        })

        it('truncates track list beyond 10 with overflow message', () => {
            const tracks = Array.from({ length: 12 }, (_, i) => ({
                title: `Track ${i + 1}`,
                author: 'A',
                url: `https://example.com/${i + 1}`,
            }))

            createQueueEmbed({ tracks })

            const calls = (mockEmbed.addFields as ReturnType<typeof jest.fn>)
                .mock.calls
            const allFields = calls.flatMap(
                (c: unknown[]) => c[0] as { name: string; value: string }[],
            )
            const queueField = allFields.find(
                (f) => f.name === 'Queue (12 tracks)',
            )
            expect(queueField?.value).toContain('... and 2 more')
        })

        it('does not show overflow message for 10 or fewer tracks', () => {
            const tracks = Array.from({ length: 10 }, (_, i) => ({
                title: `Track ${i + 1}`,
                author: 'A',
                url: `https://example.com/${i + 1}`,
            }))

            createQueueEmbed({ tracks })

            const calls = (mockEmbed.addFields as ReturnType<typeof jest.fn>)
                .mock.calls
            const allFields = calls.flatMap(
                (c: unknown[]) => c[0] as { name: string; value: string }[],
            )
            const queueField = allFields.find(
                (f) => f.name === 'Queue (10 tracks)',
            )
            expect(queueField?.value).not.toContain('more')
        })

        it('shows total duration when provided', () => {
            createQueueEmbed({
                tracks: [],
                totalDuration: '1:23:45',
            })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Total Duration',
                        value: '1:23:45',
                    }),
                ]),
            )
        })

        it('shows loop status', () => {
            createQueueEmbed({ tracks: [], isLooping: true })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Status',
                        value: expect.stringContaining('🔁 Loop'),
                    }),
                ]),
            )
        })

        it('shows shuffle status', () => {
            createQueueEmbed({ tracks: [], isShuffled: true })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Status',
                        value: expect.stringContaining('🔀 Shuffle'),
                    }),
                ]),
            )
        })

        it('shows autoplay status', () => {
            createQueueEmbed({ tracks: [], autoplayEnabled: true })

            expect(mockEmbed.addFields).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Status',
                        value: expect.stringContaining('🔄 Autoplay'),
                    }),
                ]),
            )
        })

        it('combines multiple status flags', () => {
            createQueueEmbed({
                tracks: [],
                isLooping: true,
                isShuffled: true,
                autoplayEnabled: true,
            })

            const calls = (mockEmbed.addFields as ReturnType<typeof jest.fn>)
                .mock.calls
            const allFields = calls.flatMap(
                (c: unknown[]) => c[0] as { name: string; value: string }[],
            )
            const statusField = allFields.find((f) => f.name === 'Status')
            expect(statusField?.value).toContain('🔁 Loop')
            expect(statusField?.value).toContain('🔀 Shuffle')
            expect(statusField?.value).toContain('🔄 Autoplay')
        })

        it('does not show status field when no flags set', () => {
            createQueueEmbed({ tracks: [] })

            const calls = (mockEmbed.addFields as ReturnType<typeof jest.fn>)
                .mock.calls
            const allFields = calls.flatMap(
                (c: unknown[]) => c[0] as { name: string; value: string }[],
            )
            const statusField = allFields.find((f) => f.name === 'Status')
            expect(statusField).toBeUndefined()
        })

        it('sets timestamp', () => {
            createQueueEmbed({ tracks: [] })
            expect(mockEmbed.setTimestamp).toHaveBeenCalled()
        })
    })
})
