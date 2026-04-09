import { describe, it, expect } from '@jest/globals'
import { buildTrackEmbed } from './buildTrackEmbed'
import { detectSource } from '../../music/nowPlayingEmbed'

const fakeUser = {
    tag: 'Admin#0001',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/abc.png',
}

describe('detectSource', () => {
    it('prefers an explicit track.source when provided', () => {
        expect(detectSource({ source: 'spotify' }).label).toBe('Spotify')
    })

    it('falls back to URL sniffing for youtube.com', () => {
        expect(
            detectSource({ url: 'https://youtube.com/watch?v=abc' }).label,
        ).toBe('YouTube')
    })

    it('falls back to URL sniffing for youtu.be', () => {
        expect(detectSource({ url: 'https://youtu.be/abc' }).label).toBe(
            'YouTube',
        )
    })

    it('falls back to URL sniffing for open.spotify.com', () => {
        expect(
            detectSource({ url: 'https://open.spotify.com/track/abc' }).label,
        ).toBe('Spotify')
    })

    it('falls back to URL sniffing for soundcloud.com', () => {
        expect(
            detectSource({ url: 'https://soundcloud.com/artist/track' }).label,
        ).toBe('SoundCloud')
    })

    it('returns generic "Music" badge when nothing matches', () => {
        expect(
            detectSource({ url: 'https://example.com/track.mp3' }).label,
        ).toBe('Music')
        expect(detectSource({}).label).toBe('Music')
    })
})

describe('buildTrackEmbed', () => {
    const baseTrack = {
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        url: 'https://youtube.com/watch?v=abc',
        thumbnail: 'https://img.youtube.com/vi/abc/hq.jpg',
        duration: '5:55',
    }

    it('produces a playing embed with title, author, thumbnail, source, duration', () => {
        const embed = buildTrackEmbed(baseTrack, 'playing', fakeUser)
        const data = embed.data

        expect(data.title).toBe('Bohemian Rhapsody')
        expect(data.description).toContain('Queen')
        expect(data.url).toBe(baseTrack.url)
        expect(data.thumbnail?.url).toBe(baseTrack.thumbnail)
        expect(data.author?.name).toContain('Now Playing')
        expect(data.footer?.text).toContain('Admin#0001')

        const fields = data.fields ?? []
        const durationField = fields.find((f) => f.name === 'Duration')
        const sourceField = fields.find((f) => f.name === 'Source')
        expect(durationField?.value).toBe('5:55')
        expect(sourceField?.value).toBe('YouTube')
    })

    it('uses "Queued" header when kind is queued', () => {
        const embed = buildTrackEmbed(baseTrack, 'queued', fakeUser)
        expect(embed.data.author?.name).toContain('Queued')
    })

    it('uses "Recommended" header when kind is recommended', () => {
        const embed = buildTrackEmbed(baseTrack, 'recommended')
        expect(embed.data.author?.name).toContain('Recommended')
    })

    it('uses "From History" header when kind is history', () => {
        const embed = buildTrackEmbed(baseTrack, 'history')
        expect(embed.data.author?.name).toContain('From History')
    })

    it('omits duration field when duration is 0:00 (unknown)', () => {
        const embed = buildTrackEmbed(
            { ...baseTrack, duration: '0:00' },
            'playing',
        )
        const fields = embed.data.fields ?? []
        expect(fields.find((f) => f.name === 'Duration')).toBeUndefined()
    })

    it('works without requestedBy footer', () => {
        const embed = buildTrackEmbed(baseTrack, 'playing')
        expect(embed.data.footer).toBeUndefined()
    })

    it('handles undefined title with "Unknown Track" fallback', () => {
        const embed = buildTrackEmbed(
            { ...baseTrack, title: undefined },
            'playing',
        )
        expect(embed.data.title).toBe('Unknown Track')
    })

    it('handles undefined author with "Unknown artist" fallback', () => {
        const embed = buildTrackEmbed(
            { ...baseTrack, author: undefined },
            'playing',
        )
        expect(embed.data.description).toContain('Unknown artist')
    })

    it('omits thumbnail when not provided', () => {
        const embed = buildTrackEmbed(
            { ...baseTrack, thumbnail: undefined },
            'playing',
        )
        expect(embed.data.thumbnail).toBeUndefined()
    })

    it('uses Spotify color when detecting Spotify source', () => {
        const embed = buildTrackEmbed(
            {
                ...baseTrack,
                url: 'https://open.spotify.com/track/abc',
                source: 'spotify',
            },
            'playing',
        )
        expect(embed.data.color).toBe(0x1db954)
        const sourceField = embed.data.fields?.find((f) => f.name === 'Source')
        expect(sourceField?.value).toBe('Spotify')
    })

    it('omits URL when not provided', () => {
        const embed = buildTrackEmbed(
            { ...baseTrack, url: undefined },
            'playing',
        )
        expect(embed.data.url).toBeUndefined()
    })

    it('includes timestamp in all embeds', () => {
        const embed = buildTrackEmbed(baseTrack, 'playing')
        expect(embed.data.timestamp).toBeDefined()
    })
})
