import { normalizeText, normalizeTrackKey } from './scoringUtils'

describe('scoringUtils normalization keeps combining marks (#2951)', () => {
    it('normalizeText tells a vowel sign apart from the bare consonant', () => {
        expect(normalizeText('कु')).not.toBe(normalizeText('क'))
    })

    it('normalizeTrackKey does not merge titles that differ by a mark', () => {
        expect(normalizeTrackKey('कु', 'Artist')).not.toBe(
            normalizeTrackKey('क', 'Artist'),
        )
    })

    it('still ignores punctuation, case and spacing', () => {
        expect(normalizeText('  Hello, World! ')).toBe('helloworld')
    })
})
