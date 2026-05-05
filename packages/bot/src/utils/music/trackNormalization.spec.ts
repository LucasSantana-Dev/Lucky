import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const cleanTitleMock = jest.fn()
const cleanAuthorMock = jest.fn()

jest.mock('./searchQueryCleaner', () => ({
    cleanTitle: (...args: unknown[]) => cleanTitleMock(...args),
    cleanAuthor: (...args: unknown[]) => cleanAuthorMock(...args),
}))

import {
    normalizeText,
    normalizeTrackKey,
    FUZZY_TITLE_THRESHOLD,
    getGenreFamilies,
    calculateGenreFamilyPenalty,
} from './trackNormalization'

describe('normalizeText', () => {
    it('lowercases and strips non-alphanumeric characters', () => {
        expect(normalizeText('Hello, World!')).toBe('helloworld')
    })

    it('returns empty string for empty input', () => {
        expect(normalizeText('')).toBe('')
    })

    it('returns empty string for undefined', () => {
        expect(normalizeText(undefined)).toBe('')
    })

    it('preserves Unicode letters including accented characters', () => {
        expect(normalizeText('Café')).toBe('café')
    })

    it('preserves digits', () => {
        expect(normalizeText('Track 42')).toBe('track42')
    })
})

describe('FUZZY_TITLE_THRESHOLD', () => {
    it('equals 0.82', () => {
        expect(FUZZY_TITLE_THRESHOLD).toBe(0.82)
    })
})

describe('normalizeTrackKey', () => {
    beforeEach(() => {
        cleanTitleMock.mockImplementation((s: unknown) => s)
        cleanAuthorMock.mockImplementation((s: unknown) => s)
    })

    it('builds key from title and primary author', () => {
        const key = normalizeTrackKey('My Song', 'Artist One')
        expect(key).toBe('mysong::artistone')
    })

    it('takes only the first comma-separated author', () => {
        const key = normalizeTrackKey('Song', 'Artist A, Artist B')
        expect(key).toBe('song::artista')
    })

    it('strips feat keyword from author', () => {
        const key = normalizeTrackKey('Song', 'Main Artist feat Featuring Artist')
        expect(key).toBe('song::mainartist')
    })

    it('strips ft keyword from author', () => {
        const key = normalizeTrackKey('Song', 'Main Artist ft Feat')
        expect(key).toBe('song::mainartist')
    })

    it('strips con keyword from author', () => {
        const key = normalizeTrackKey('Song', 'Artist con Otro')
        expect(key).toBe('song::artist')
    })

    it('strips with keyword from author', () => {
        const key = normalizeTrackKey('Song', 'Artist with Collab')
        expect(key).toBe('song::artist')
    })

    it('handles missing title', () => {
        const key = normalizeTrackKey(undefined, 'Artist')
        expect(key).toBe('::artist')
    })

    it('handles missing author', () => {
        const key = normalizeTrackKey('Song', undefined)
        expect(key).toBe('song::')
    })

    it('handles both missing', () => {
        const key = normalizeTrackKey(undefined, undefined)
        expect(key).toBe('::')
    })
})

describe('getGenreFamilies', () => {
    it('maps hip hop to rap_hiphop family', () => {
        const families = getGenreFamilies(['hip hop'])
        expect(families.has('rap_hiphop')).toBe(true)
    })

    it('maps rap to rap_hiphop family', () => {
        const families = getGenreFamilies(['rap'])
        expect(families.has('rap_hiphop')).toBe(true)
    })

    it('maps rock to rock_metal family', () => {
        const families = getGenreFamilies(['rock'])
        expect(families.has('rock_metal')).toBe(true)
    })

    it('maps house to electronic family', () => {
        const families = getGenreFamilies(['house'])
        expect(families.has('electronic')).toBe(true)
    })

    it('maps pop to pop family', () => {
        const families = getGenreFamilies(['pop'])
        expect(families.has('pop')).toBe(true)
    })

    it('returns empty set for empty genres', () => {
        const families = getGenreFamilies([])
        expect(families.size).toBe(0)
    })

    it('returns empty set for unrecognized genres', () => {
        const families = getGenreFamilies(['xyzunknown'])
        expect(families.size).toBe(0)
    })

    it('maps multiple genres to multiple families', () => {
        const families = getGenreFamilies(['rock', 'house'])
        expect(families.has('rock_metal')).toBe(true)
        expect(families.has('electronic')).toBe(true)
    })

    it('genre keyword partial match works (e.g. "k-pop" contains "pop")', () => {
        const families = getGenreFamilies(['k-pop'])
        expect(families.has('pop')).toBe(true)
    })
})

describe('calculateGenreFamilyPenalty', () => {
    it('returns 0 when genres share a family', () => {
        const penalty = calculateGenreFamilyPenalty(['rock'], ['metal'])
        expect(penalty).toBe(0)
    })

    it('returns -0.1 when current genres are empty', () => {
        const penalty = calculateGenreFamilyPenalty([], ['rock'])
        expect(penalty).toBe(-0.1)
    })

    it('returns -0.1 when candidate genres are empty', () => {
        const penalty = calculateGenreFamilyPenalty(['rock'], [])
        expect(penalty).toBe(-0.1)
    })

    it('returns -0.6 for strong genre with no family overlap (rap_hiphop)', () => {
        const penalty = calculateGenreFamilyPenalty(['hip hop'], ['rock'])
        expect(penalty).toBe(-0.6)
    })

    it('returns -0.6 for strong genre with no family overlap (rock_metal)', () => {
        const penalty = calculateGenreFamilyPenalty(['metal'], ['pop'])
        expect(penalty).toBe(-0.6)
    })

    it('returns -0.3 for non-strong genre with no family overlap', () => {
        const penalty = calculateGenreFamilyPenalty(['pop'], ['jazz'])
        expect(penalty).toBe(-0.3)
    })

    it('returns -0.1 when both genre lists are unrecognized', () => {
        const penalty = calculateGenreFamilyPenalty(['xyzunknown'], ['abcunknown'])
        expect(penalty).toBe(-0.1)
    })
})
