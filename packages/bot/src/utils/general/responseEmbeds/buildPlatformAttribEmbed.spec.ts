import { describe, it, expect } from '@jest/globals'
import { buildPlatformAttribEmbed } from './buildPlatformAttribEmbed'

describe('buildPlatformAttribEmbed', () => {
    it('creates Last.fm branded embed with correct color and emoji', () => {
        const embed = buildPlatformAttribEmbed('lastfm', {
            title: 'User Profile',
            description: 'Top tracks',
        })
        const data = embed.data

        expect(data.author?.name).toContain('📊')
        expect(data.author?.name).toContain('Last.fm')
        expect(data.color).toBe(0xd51007)
    })

    it('creates Spotify branded embed with correct color and emoji', () => {
        const embed = buildPlatformAttribEmbed('spotify', {
            title: 'Top Tracks',
        })
        const data = embed.data

        expect(data.author?.name).toContain('🟢')
        expect(data.author?.name).toContain('Spotify')
        expect(data.color).toBe(0x1db954)
    })

    it('creates YouTube branded embed with correct color and emoji', () => {
        const embed = buildPlatformAttribEmbed('youtube', {
            description: 'Video details',
        })
        const data = embed.data

        expect(data.author?.name).toContain('🔴')
        expect(data.author?.name).toContain('YouTube')
        expect(data.color).toBe(0xff0000)
    })

    it('includes title when provided', () => {
        const embed = buildPlatformAttribEmbed('lastfm', {
            title: 'My Scrobbles',
        })
        expect(embed.data.title).toBe('My Scrobbles')
    })

    it('omits title when not provided', () => {
        const embed = buildPlatformAttribEmbed('lastfm', {})
        expect(embed.data.title).toBeUndefined()
    })

    it('includes description when provided', () => {
        const embed = buildPlatformAttribEmbed('spotify', {
            description: 'Your top tracks of 2024',
        })
        expect(embed.data.description).toBe('Your top tracks of 2024')
    })

    it('omits description when not provided', () => {
        const embed = buildPlatformAttribEmbed('spotify', {})
        expect(embed.data.description).toBeUndefined()
    })

    it('includes thumbnail when provided', () => {
        const thumbnailUrl = 'https://example.com/image.png'
        const embed = buildPlatformAttribEmbed('youtube', {
            thumbnail: thumbnailUrl,
        })
        expect(embed.data.thumbnail?.url).toBe(thumbnailUrl)
    })

    it('omits thumbnail when not provided', () => {
        const embed = buildPlatformAttribEmbed('youtube', {})
        expect(embed.data.thumbnail).toBeUndefined()
    })

    it('includes URL when provided', () => {
        const url = 'https://last.fm/user/example'
        const embed = buildPlatformAttribEmbed('lastfm', { url })
        expect(embed.data.url).toBe(url)
    })

    it('omits URL when not provided', () => {
        const embed = buildPlatformAttribEmbed('lastfm', {})
        expect(embed.data.url).toBeUndefined()
    })

    it('includes all body properties when fully populated', () => {
        const body = {
            title: 'Test Title',
            description: 'Test Description',
            thumbnail: 'https://example.com/thumb.png',
            url: 'https://example.com',
        }
        const embed = buildPlatformAttribEmbed('spotify', body)
        const data = embed.data

        expect(data.title).toBe('Test Title')
        expect(data.description).toBe('Test Description')
        expect(data.thumbnail?.url).toBe('https://example.com/thumb.png')
        expect(data.url).toBe('https://example.com')
    })

    it('includes timestamp in all embeds', () => {
        const embed = buildPlatformAttribEmbed('lastfm', {})
        expect(embed.data.timestamp).toBeDefined()
    })

    it('handles empty body object gracefully', () => {
        const embed = buildPlatformAttribEmbed('youtube', {})
        const data = embed.data

        expect(data.author?.name).toContain('YouTube')
        expect(data.title).toBeUndefined()
        expect(data.description).toBeUndefined()
    })
})
