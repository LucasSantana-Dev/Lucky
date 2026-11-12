import { describe, it, expect } from '@jest/globals'
import {
    buildPlayResponseEmbed,
    detectSource,
    escapeTrackText,
    formatTrackLine,
} from './nowPlayingEmbed'
import { translatorFor } from '../../i18n'

const fakeUser = { tag: 'Admin#0001' }
const en = translatorFor('en')
const ptBR = translatorFor('pt-BR')

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

describe('formatTrackLine', () => {
    it('renders a linked bold title, the artist and the duration', () => {
        expect(
            formatTrackLine(
                {
                    title: 'Depois',
                    author: 'Marisa Monte',
                    url: 'https://x.test/1',
                    duration: '2:53',
                },
                en,
            ),
        ).toBe('[**Depois**](https://x.test/1) · Marisa Monte (2:53)')
    })

    it('drops an unknown duration and the link when there is no url', () => {
        expect(
            formatTrackLine(
                { title: 'Depois', author: 'Marisa Monte', duration: '0:00' },
                en,
            ),
        ).toBe('**Depois** · Marisa Monte')
    })

    it('falls back to localized unknown title and artist', () => {
        expect(formatTrackLine({ title: '', author: '' }, ptBR)).toBe(
            '**Faixa desconhecida** · Artista desconhecido',
        )
    })

    it('falls back to English without a translator', () => {
        expect(formatTrackLine({})).toBe('**Unknown track** · Unknown artist')
    })

    it('escapes brackets so a title like "[Official Video]" keeps the link intact', () => {
        expect(escapeTrackText('Song [Official Video]')).toBe(
            'Song \\[Official Video\\]',
        )
        expect(escapeTrackText('*bold*')).toBe('\\*bold\\*')
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

    it('is one line: no title, thumbnail, fields or timestamp', () => {
        const embed = buildPlayResponseEmbed(
            { kind: 'nowPlaying', track: baseTrack, requestedBy: fakeUser },
            en,
        )
        expect(embed.data.description).toBe(
            '▶️ Now playing [**Bohemian Rhapsody**](https://youtube.com/watch?v=abc) · Queen (5:55)',
        )
        expect(embed.data.footer?.text).toBe('Requested by Admin#0001')
        expect(embed.data.title).toBeUndefined()
        expect(embed.data.thumbnail).toBeUndefined()
        expect(embed.data.fields).toBeUndefined()
        expect(embed.data.timestamp).toBeUndefined()
    })

    it('puts the queue position before the requester when queued', () => {
        const embed = buildPlayResponseEmbed(
            {
                kind: 'addedToQueue',
                track: baseTrack,
                requestedBy: fakeUser,
                queuePosition: 3,
            },
            en,
        )
        expect(embed.data.description).toBe(
            '➕ Queued [**Bohemian Rhapsody**](https://youtube.com/watch?v=abc) · Queen (5:55)',
        )
        expect(embed.data.footer?.text).toBe(
            'Position 3 · requested by Admin#0001',
        )
    })

    it('is translated with the guild language', () => {
        const embed = buildPlayResponseEmbed(
            {
                kind: 'addedToQueue',
                track: baseTrack,
                requestedBy: fakeUser,
                queuePosition: 1,
            },
            ptBR,
        )
        expect(embed.data.description).toMatch(/^➕ Na fila /)
        expect(embed.data.footer?.text).toBe(
            'Posição 1 · pedido por Admin#0001',
        )
    })

    it('renders a playlist on one line, linked to the playlist itself', () => {
        const embed = buildPlayResponseEmbed(
            {
                kind: 'playlistQueued',
                track: baseTrack,
                requestedBy: fakeUser,
                playlist: {
                    title: 'Classic Rock',
                    trackCount: 42,
                    url: 'https://open.spotify.com/playlist/xyz',
                },
            },
            en,
        )
        expect(embed.data.description).toBe(
            '📃 Playlist [**Classic Rock**](https://open.spotify.com/playlist/xyz) · 42 tracks queued',
        )
        expect(embed.data.footer?.text).toBe('Requested by Admin#0001')
    })

    it('colors by action, not by source: queued and now playing never look alike', () => {
        const spotify = {
            ...baseTrack,
            url: 'https://open.spotify.com/track/abc',
            source: 'spotify',
        }
        const playing = buildPlayResponseEmbed(
            { kind: 'nowPlaying', track: spotify, requestedBy: fakeUser },
            en,
        )
        const queued = buildPlayResponseEmbed(
            {
                kind: 'addedToQueue',
                track: spotify,
                requestedBy: fakeUser,
                queuePosition: 1,
            },
            en,
        )
        expect(playing.data.color).toBe(0x9c27b0)
        expect(queued.data.color).toBe(0x5865f2)
    })
})
