import { describe, it, expect } from '@jest/globals'
import type {
    CreateEmbedOptions,
    EmbedField,
    TrackInfo,
    QueueInfo
} from './types'
import { EMBED_COLORS, EMOJIS } from './constants'

describe('Embed Types', () => {
    describe('CreateEmbedOptions', () => {
        it('should accept all optional properties', () => {
            const options: CreateEmbedOptions = {
                title: 'Test Title',
                description: 'Test Description',
                color: EMBED_COLORS.SUCCESS,
                emoji: EMOJIS.SUCCESS,
                thumbnail: 'https://example.com/thumb.png',
                url: 'https://example.com',
                author: {
                    name: 'Test Author',
                    iconURL: 'https://example.com/icon.png',
                    url: 'https://example.com/author'
                },
                fields: [
                    { name: 'Field 1', value: 'Value 1', inline: true },
                    { name: 'Field 2', value: 'Value 2', inline: false }
                ],
                footer: 'Test Footer',
                timestamp: true
            }

            expect(options.title).toBe('Test Title')
            expect(options.description).toBe('Test Description')
            expect(options.color).toBe(EMBED_COLORS.SUCCESS)
            expect(options.emoji).toBe(EMOJIS.SUCCESS)
            expect(options.thumbnail).toBe('https://example.com/thumb.png')
            expect(options.url).toBe('https://example.com')
            expect(options.author).toBeDefined()
            expect(options.fields).toHaveLength(2)
            expect(options.footer).toBe('Test Footer')
            expect(options.timestamp).toBe(true)
        })

        it('should accept minimal properties', () => {
            const options: CreateEmbedOptions = {
                title: 'Minimal Title'
            }

            expect(options.title).toBe('Minimal Title')
            expect(options.description).toBeUndefined()
            expect(options.color).toBeUndefined()
            expect(options.emoji).toBeUndefined()
        })

        it('should accept empty object', () => {
            const options: CreateEmbedOptions = {}
            expect(options).toBeDefined()
        })
    })

    describe('EmbedField', () => {
        it('should accept required properties', () => {
            const field: EmbedField = {
                name: 'Field Name',
                value: 'Field Value'
            }

            expect(field.name).toBe('Field Name')
            expect(field.value).toBe('Field Value')
            expect(field.inline).toBeUndefined()
        })

        it('should accept inline property', () => {
            const field: EmbedField = {
                name: 'Field Name',
                value: 'Field Value',
                inline: true
            }

            expect(field.inline).toBe(true)
        })

        it('should accept inline as false', () => {
            const field: EmbedField = {
                name: 'Field Name',
                value: 'Field Value',
                inline: false
            }

            expect(field.inline).toBe(false)
        })
    })

    describe('TrackInfo', () => {
        it('should accept all track properties', () => {
            const track: TrackInfo = {
                title: 'Test Track',
                author: 'Test Artist',
                url: 'https://example.com/track',
                thumbnail: 'https://example.com/thumb.jpg',
                duration: '3:30',
                requestedBy: 'user123',
                source: 'youtube'
            }

            expect(track.title).toBe('Test Track')
            expect(track.author).toBe('Test Artist')
            expect(track.url).toBe('https://example.com/track')
            expect(track.thumbnail).toBe('https://example.com/thumb.jpg')
            expect(track.duration).toBe('3:30')
            expect(track.requestedBy).toBe('user123')
            expect(track.source).toBe('youtube')
        })

        it('should accept minimal track properties', () => {
            const track: TrackInfo = {
                title: 'Test Track',
                author: 'Test Artist',
                url: 'https://example.com/track'
            }

            expect(track.title).toBe('Test Track')
            expect(track.author).toBe('Test Artist')
            expect(track.url).toBe('https://example.com/track')
        })
    })

    describe('QueueInfo', () => {
        it('should accept all queue properties', () => {
            const queue: QueueInfo = {
                currentTrack: {
                    title: 'Current Track',
                    author: 'Current Artist',
                    url: 'https://example.com/current'
                },
                tracks: [
                    {
                        title: 'Track 1',
                        author: 'Artist 1',
                        url: 'https://example.com/track1'
                    },
                    {
                        title: 'Track 2',
                        author: 'Artist 2',
                        url: 'https://example.com/track2'
                    }
                ],
                totalDuration: '10:30',
                isLooping: true,
                isShuffled: false,
                autoplayEnabled: true
            }

            expect(queue.currentTrack).toBeDefined()
            expect(queue.tracks).toHaveLength(2)
            expect(queue.totalDuration).toBe('10:30')
            expect(queue.isLooping).toBe(true)
            expect(queue.isShuffled).toBe(false)
            expect(queue.autoplayEnabled).toBe(true)
        })

        it('should accept minimal queue properties', () => {
            const queue: QueueInfo = {
                tracks: []
            }

            expect(queue.tracks).toHaveLength(0)
            expect(queue.currentTrack).toBeUndefined()
        })
    })

    describe('Type compatibility', () => {
        it('should be compatible with Discord.js EmbedBuilder', () => {
            const options: CreateEmbedOptions = {
                title: 'Test',
                description: 'Test Description',
                color: EMBED_COLORS.SUCCESS,
                fields: [
                    { name: 'Field', value: 'Value' }
                ]
            }

            // This should compile without errors
            expect(options).toBeDefined()
        })

        it('should handle undefined values correctly', () => {
            const options: CreateEmbedOptions = {
                title: undefined,
                description: undefined,
                color: undefined,
                emoji: undefined,
                thumbnail: undefined,
                url: undefined,
                author: undefined,
                fields: undefined,
                footer: undefined,
                timestamp: undefined
            }

            expect(options.title).toBeUndefined()
            expect(options.description).toBeUndefined()
            expect(options.color).toBeUndefined()
            expect(options.emoji).toBeUndefined()
            expect(options.thumbnail).toBeUndefined()
            expect(options.url).toBeUndefined()
            expect(options.author).toBeUndefined()
            expect(options.fields).toBeUndefined()
            expect(options.footer).toBeUndefined()
            expect(options.timestamp).toBeUndefined()
        })
    })

    describe('Array types', () => {
        it('should handle fields array', () => {
            const fields: EmbedField[] = [
                { name: 'Field 1', value: 'Value 1' },
                { name: 'Field 2', value: 'Value 2', inline: true },
                { name: 'Field 3', value: 'Value 3', inline: false }
            ]

            expect(fields).toHaveLength(3)
            expect(fields[0].name).toBe('Field 1')
            expect(fields[1].inline).toBe(true)
            expect(fields[2].inline).toBe(false)
        })

        it('should handle empty fields array', () => {
            const fields: EmbedField[] = []
            expect(fields).toHaveLength(0)
        })
    })
})
