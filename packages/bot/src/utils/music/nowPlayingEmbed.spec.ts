import { describe, it, expect } from '@jest/globals'
import { buildPlayResponseEmbed, detectSource } from './nowPlayingEmbed'

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

describe('buildPlayResponseEmbed', () => {
    const baseTrack = {
        title: 'Bohemian Rhapsody',
        author: 'Queen',
        url: 'https://youtube.com/watch?v=abc',
        thumbnail: 'https://img.youtube.com/vi/abc/hq.jpg',
        duration: '5:55',
    }

    it('produces a Now Playing embed with title, author, thumbnail, source, duration, footer', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: baseTrack,
            requestedBy: fakeUser,
        })
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

    it('omits the Duration field when duration is 0:00 (unknown)', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: { ...baseTrack, duration: '0:00' },
            requestedBy: fakeUser,
        })
        const fields = embed.data.fields ?? []
        expect(fields.find((f) => f.name === 'Duration')).toBeUndefined()
    })

    it('uses "Added to Queue" header + shows queue position when addedToQueue', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'addedToQueue',
            track: baseTrack,
            requestedBy: fakeUser,
            queuePosition: 3,
        })
        expect(embed.data.author?.name).toContain('Added to Queue')
        const posField = embed.data.fields?.find(
            (f) => f.name === 'Queue Position',
        )
        expect(posField?.value).toBe('#3')
    })

    it('renders playlistQueued with title + track count instead of single track fields', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'playlistQueued',
            track: baseTrack,
            requestedBy: fakeUser,
            playlist: { title: 'Road Trip Vibes', trackCount: 42 },
        })
        expect(embed.data.author?.name).toContain('Playlist Queued')
        expect(embed.data.title).toBe('Road Trip Vibes')
        expect(embed.data.description).toContain('42')
        // Playlist responses don't carry per-track fields — those belong to
        // individual track notifications, not the playlist summary.
        const fields = embed.data.fields ?? []
        expect(fields.find((f) => f.name === 'Duration')).toBeUndefined()
    })

    it('falls back to "Unknown Track" when title is empty', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: { ...baseTrack, title: '' },
            requestedBy: fakeUser,
        })
        expect(embed.data.title).toBe('Unknown Track')
    })

    it('uses Spotify badge color + label for spotify tracks', () => {
        const embed = buildPlayResponseEmbed({
            kind: 'nowPlaying',
            track: {
                ...baseTrack,
                url: 'https://open.spotify.com/track/abc',
                source: 'spotify',
            },
            requestedBy: fakeUser,
        })
        const sourceField = embed.data.fields?.find((f) => f.name === 'Source')
        expect(sourceField?.value).toBe('Spotify')
        expect(embed.data.color).toBe(0x1db954)
    })
})
