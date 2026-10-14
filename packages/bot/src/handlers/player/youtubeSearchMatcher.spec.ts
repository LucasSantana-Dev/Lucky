import { pickYouTubeCandidate, youtubeWatchUrl } from './youtubeSearchMatcher'

const target = (
    overrides: Partial<Parameters<typeof pickYouTubeCandidate>[0]> = {},
) => ({
    title: 'Alguém Me Avisou',
    author: 'Fabiana Cozza, Maria Bethânia',
    sourceTitle: 'Alguém Me Avisou',
    duration: '3:46',
    ...overrides,
})

const candidate = (
    id: string,
    title: string,
    channel: string,
    durationSec: number | null,
) => ({ id, title, channel, durationSec })

describe('pickYouTubeCandidate', () => {
    // Top 5 of the "official audio" query reported on 2026-10-14.
    const reported = [
        candidate(
            'gQeQ',
            'Maria Bethania - Alguem Me Avisou',
            'Musicolor Radio',
            263,
        ),
        candidate(
            'SMzl',
            'Maria Bethânia - Alguém Me Avisou',
            'Selva Tropical Bar',
            256,
        ),
        candidate(
            'crMQ',
            'Maria Bethânia-Alguém Me Avisou  Remix Prévia #sambarock',
            'Anthony Alves',
            61,
        ),
        candidate('1uMU', 'Alguém Me Avisou', 'Release - Topic', 159),
    ]

    it('rejects every hit of the reported query instead of playing the radio rip', () => {
        const { pick, rejected } = pickYouTubeCandidate(target(), reported)
        expect(pick).toBeNull()
        expect(rejected.map((r) => [r.id, r.reason])).toEqual([
            ['gQeQ', 'channel'],
            ['SMzl', 'duration'],
            // "Remix" is not tagged in this title, so duration rejects it.
            ['crMQ', 'duration'],
            ['1uMU', 'duration'],
        ])
    })

    it('picks the label upload of the broad query', () => {
        const { pick } = pickYouTubeCandidate(target(), [
            candidate(
                'fino',
                'Alguém Me Avisou | Fabiana Cozza',
                'Biscoito Fino',
                226,
            ),
            candidate(
                'tv',
                'Fabiana Cozza canta "Alguém me avisou", de Dona Ivone Lara',
                'Notícias RedeTV',
                298,
            ),
        ])
        expect(pick?.id).toBe('fino')
    })

    it('rejects "(Ao vivo)" hits for a studio pot-pourri', () => {
        const { pick, rejected } = pickYouTubeCandidate(
            target({
                title: 'Pot-Pourri: Maria de um só João / Luz do teu olhar',
                sourceTitle:
                    'Pot-Pourri: Maria de um só João / Luz do teu olhar',
                author: 'Leci Brandão',
                duration: '3:27',
            }),
            [
                candidate(
                    'HMW9',
                    'Pot-Pourri: Maria de um só João / Luz do teu olhar (Ao vivo)',
                    'Leci Brandão - Topic',
                    207,
                ),
            ],
        )
        expect(pick).toBeNull()
        expect(rejected[0].reason).toBe('marker')
    })

    it('ranks the Topic channel above the artist channel and a fan upload', () => {
        const { pick } = pickYouTubeCandidate(
            target({ author: 'Leci Brandão', duration: '3:46' }),
            [
                candidate(
                    'fan',
                    'Leci Brandão - Alguém Me Avisou',
                    'Samba Fan',
                    226,
                ),
                candidate('vevo', 'Alguém Me Avisou', 'LeciBrandaoVEVO', 228),
                candidate(
                    'topic',
                    'Alguém Me Avisou',
                    'Leci Brandão - Topic',
                    226,
                ),
            ],
        )
        expect(pick?.id).toBe('topic')
    })

    it('allows a marker that is part of the credited artist name', () => {
        const { pick } = pickYouTubeCandidate(
            target({
                title: 'Taki Taki',
                sourceTitle: 'Taki Taki (with Selena Gomez, Ozuna & Cardi B)',
                author: 'DJ Snake, Selena Gomez',
                duration: '3:32',
            }),
            [
                candidate(
                    'taki',
                    'DJ Snake - Taki Taki ft. Selena Gomez',
                    'DJSnakeVEVO',
                    213,
                ),
            ],
        )
        expect(pick?.id).toBe('taki')
    })

    it('gates on the title without its parentheticals', () => {
        const { pick } = pickYouTubeCandidate(
            target({
                title: 'Song (feat. Someone)',
                sourceTitle: 'Song (feat. Someone)',
                author: 'Artist',
                duration: '3:00',
            }),
            [candidate('s', 'Song', 'Artist - Topic', 181)],
        )
        expect(pick?.id).toBe('s')
    })

    it('does not read a bare title word as a version marker', () => {
        const { pick } = pickYouTubeCandidate(
            target({
                title: 'Forever',
                sourceTitle: 'Forever',
                author: 'Artist',
                duration: '4:00',
            }),
            [candidate('lf', 'Live Forever', 'Artist - Topic', 240)],
        )
        expect(pick?.id).toBe('lf')
    })

    it.each([
        'Forever (Live at Wembley)',
        'Forever [Karaoke Version]',
        'Artist - Forever - Remix',
    ])('rejects a tagged version marker: %p', (title) => {
        const { pick, rejected } = pickYouTubeCandidate(
            target({
                title: 'Forever',
                sourceTitle: 'Forever',
                author: 'Artist',
                duration: '4:00',
            }),
            [candidate('v', title, 'Artist - Topic', 240)],
        )
        expect(pick).toBeNull()
        expect(rejected[0].reason).toBe('marker')
    })

    it('keeps a duo credited with "&" as one artist', () => {
        const { pick } = pickYouTubeCandidate(
            target({
                title: 'The Boxer',
                sourceTitle: 'The Boxer',
                author: 'Simon & Garfunkel',
                duration: '5:08',
            }),
            [
                candidate('fan', 'The Boxer', 'Art Garfunkel Archive', 308),
                candidate('duo', 'The Boxer', 'Simon & Garfunkel', 308),
            ],
        )
        expect(pick?.id).toBe('duo')
    })

    it('matches non-Latin titles', () => {
        const { pick } = pickYouTubeCandidate(
            target({
                title: 'アイドル',
                sourceTitle: 'アイドル',
                author: 'YOASOBI',
                duration: '3:33',
            }),
            [
                candidate(
                    'idol',
                    'YOASOBI「アイドル」 Official Music Video',
                    'Ayase / YOASOBI',
                    213,
                ),
            ],
        )
        expect(pick?.id).toBe('idol')
    })

    it('skips the duration gate when the Spotify duration is unknown', () => {
        const { pick } = pickYouTubeCandidate(target({ duration: '0:00' }), [
            candidate(
                'nodur',
                'Alguém Me Avisou',
                'Fabiana Cozza - Topic',
                null,
            ),
        ])
        expect(pick?.id).toBe('nodur')
    })

    it('rejects a hit without a duration when the Spotify duration is known', () => {
        const { pick, rejected } = pickYouTubeCandidate(target(), [
            candidate(
                'stream',
                'Alguém Me Avisou',
                'Fabiana Cozza - Topic',
                null,
            ),
        ])
        expect(pick).toBeNull()
        expect(rejected[0].reason).toBe('duration')
    })
})

describe('youtubeWatchUrl', () => {
    it('builds a youtube.com watch URL', () => {
        expect(youtubeWatchUrl('abc_-1')).toBe(
            'https://www.youtube.com/watch?v=abc_-1',
        )
    })
})
