import type { Track } from 'discord-player'
import { isAnchorTrack, selectAnchorSeeds } from './anchorSeeds'
import { normalizeTrackKey } from './scoringUtils'

function track(title: string, author: string, isAutoplay = false): Track {
    return {
        title,
        author,
        url: `https://example.com/${title}`,
        metadata: isAutoplay ? { isAutoplay: true } : {},
    } as unknown as Track
}

function signals(
    overrides: Partial<Parameters<typeof isAnchorTrack>[1]> = {},
): Parameters<typeof isAnchorTrack>[1] {
    return {
        likedWeights: new Map(),
        implicitLikeKeys: new Set(),
        implicitDislikeKeys: new Set(),
        ...overrides,
    }
}

describe('isAnchorTrack', () => {
    it('anchors a requested track', () => {
        expect(isAnchorTrack(track('Song', 'Artist'), signals())).toBe(true)
    })

    it('does not anchor a requested track the listener skipped early', () => {
        const t = track('Song', 'Artist')
        const s = signals({
            implicitDislikeKeys: new Set([normalizeTrackKey('Song', 'Artist')]),
        })
        expect(isAnchorTrack(t, s)).toBe(false)
    })

    it('does not anchor an autoplay pick with no positive signal', () => {
        expect(isAnchorTrack(track('Pick', 'Other', true), signals())).toBe(
            false,
        )
    })

    it('anchors an autoplay pick that was played through', () => {
        const s = signals({
            implicitLikeKeys: new Set([normalizeTrackKey('Pick', 'Other')]),
        })
        expect(isAnchorTrack(track('Pick', 'Other', true), s)).toBe(true)
    })

    it('anchors an autoplay pick that was liked', () => {
        const s = signals({
            likedWeights: new Map([[normalizeTrackKey('Pick', 'Other'), 1]]),
        })
        expect(isAnchorTrack(track('Pick', 'Other', true), s)).toBe(true)
    })

    it('does not anchor a liked autoplay pick that was later skipped', () => {
        const key = normalizeTrackKey('Pick', 'Other')
        const s = signals({
            likedWeights: new Map([[key, 1]]),
            implicitDislikeKeys: new Set([key]),
        })
        expect(isAnchorTrack(track('Pick', 'Other', true), s)).toBe(false)
    })
})

describe('selectAnchorSeeds', () => {
    it('never seeds from a skipped autoplay pick (#2934)', () => {
        const current = track('Requested', 'Band')
        const skipped = track('Skipped Pick', 'Stranger', true)
        const s = signals({
            implicitDislikeKeys: new Set([
                normalizeTrackKey('Skipped Pick', 'Stranger'),
            ]),
        })

        const seeds = selectAnchorSeeds(current, [skipped], s, 4)

        expect(seeds).toEqual([current])
    })

    it('skips an unqualified current pick and seeds from requested history', () => {
        const current = track('Pick', 'Drift', true)
        const requested = track('Requested', 'Band')

        const seeds = selectAnchorSeeds(current, [requested], signals(), 4)

        expect(seeds).toEqual([requested])
    })

    it('keeps order and caps at the limit', () => {
        const current = track('A', 'Band')
        const history = [
            track('B', 'Band'),
            track('C', 'Band'),
            track('D', 'Band'),
        ]

        const seeds = selectAnchorSeeds(current, history, signals(), 2)

        expect(seeds.map((t) => t.title)).toEqual(['A', 'B'])
    })

    it('falls back to the current track when nothing qualifies', () => {
        const current = track('Pick', 'Drift', true)
        const other = track('Other Pick', 'Drift', true)

        const seeds = selectAnchorSeeds(current, [other], signals(), 4)

        expect(seeds).toEqual([current])
    })
})
