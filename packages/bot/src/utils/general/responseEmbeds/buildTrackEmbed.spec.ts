import { describe, it, expect } from '@jest/globals'
import { buildTrackEmbed, buildCommandTrackEmbed, trackToData } from './buildTrackEmbed'
import { detectSource } from '../../music/nowPlayingEmbed'

const fakeUser = {
    tag: 'Admin#0001',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/abc.png',
}

describe('detectSource', () => {
    it.each([
        [{ source: 'spotify' }, 'Spotify'],
        [{ url: 'https://youtube.com/watch?v=abc' }, 'YouTube'],
        [{ url: 'https://open.spotify.com/track/abc' }, 'Spotify'],
        [{ url: 'https://soundcloud.com/artist/track' }, 'SoundCloud'],
    ])('detects source from source or URL', (input, expected) => {
        expect(detectSource(input).label).toBe(expected)
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

    it.each([
        ['playing', 'Now Playing', true],
        ['recommended', 'Recommended', false],
    ] as const)('produces %s embed with expected header', (kind, expectedHeader, hasFooter) => {
        const embed = buildTrackEmbed(baseTrack, kind, hasFooter ? fakeUser : undefined)
        expect(embed.data.author?.name).toContain(expectedHeader)
        if (hasFooter) {
            expect(embed.data.title).toBe('Bohemian Rhapsody')
            expect(embed.data.footer?.text).toContain('Admin#0001')
        }
    })

    it('handles missing/unknown fields and edge cases', () => {
        // Missing title
        const noTitle = buildTrackEmbed({ ...baseTrack, title: undefined }, 'playing')
        expect(noTitle.data.title).toBe('Unknown Track')

        // Missing author
        const noAuthor = buildTrackEmbed({ ...baseTrack, author: undefined }, 'playing')
        expect(noAuthor.data.description).toContain('Unknown artist')

        // Missing thumbnail
        const noThumb = buildTrackEmbed({ ...baseTrack, thumbnail: undefined }, 'playing')
        expect(noThumb.data.thumbnail).toBeUndefined()

        // Missing URL
        const noUrl = buildTrackEmbed({ ...baseTrack, url: undefined }, 'playing')
        expect(noUrl.data.url).toBeUndefined()

        // Unknown duration
        const unknownDur = buildTrackEmbed({ ...baseTrack, duration: '0:00' }, 'playing')
        const fields = unknownDur.data.fields ?? []
        expect(fields.find((f) => f.name === 'Duration')).toBeUndefined()

        // No requestedBy
        const noFooter = buildTrackEmbed(baseTrack, 'playing')
        expect(noFooter.data.footer).toBeUndefined()
    })

})

describe('trackToData', () => {
    const fakeTrack = {
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://youtube.com/watch?v=test',
        thumbnail: 'https://img.youtube.com/test.jpg',
        durationMS: 215000,
        source: 'youtube',
    }

    it('maps all fields and formats duration correctly', () => {
        const data = trackToData(fakeTrack as never)
        expect(data.title).toBe('Test Song')
        expect(data.author).toBe('Test Artist')
        expect(data.url).toBe(fakeTrack.url)
        expect(data.thumbnail).toBe(fakeTrack.thumbnail)
        expect(data.source).toBe('youtube')
        expect(data.duration).toBe('3:35')
    })

    it.each([
        [0, undefined],
        [65000, '1:05'],
    ])('handles edge cases: durationMS=%i → %s', (durationMS, expected) => {
        const data = trackToData({ ...fakeTrack, durationMS } as never)
        expect(data.duration).toBe(expected)
        if (durationMS === 0) {
            const noSource = trackToData({ ...fakeTrack, source: undefined } as never)
            expect(noSource.source).toBeNull()
        }
    })
})

describe('buildCommandTrackEmbed', () => {
    const track = {
        title: 'Test Song',
        author: 'Test Artist',
        url: 'https://youtube.com/watch?v=test',
        thumbnail: 'https://img.youtube.com/test.jpg',
        durationMS: 60000,
        source: 'youtube',
    }

    it('builds embed with status label and track data', () => {
        const embed = buildCommandTrackEmbed(track as never, '⏸️ Paused', fakeUser)
        expect(embed.data.author?.name).toBe('⏸️ Paused')
        expect(embed.data.title).toBe(track.title)
        expect(embed.data.footer?.text).toContain(fakeUser.tag)
    })
})
