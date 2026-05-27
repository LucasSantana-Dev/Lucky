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
    getGenreFamilies,
    calculateGenreFamilyPenalty,
} from './trackNormalization'

describe('normalizeText', () => {
    it.each([
        ['Hello, World!', 'helloworld'],
        [undefined, ''],
        ['Track 42', 'track42'],
    ])('normalizes %p → %p', (input, expected) => {
        expect(normalizeText(input)).toBe(expected)
    })
})

describe('normalizeTrackKey', () => {
    beforeEach(() => {
        cleanTitleMock.mockImplementation((s: unknown) => s)
        cleanAuthorMock.mockImplementation((s: unknown) => s)
    })

    it.each([
        ['My Song', 'Artist One', 'mysong::artistone'],
        ['Song', 'Artist A, Artist B', 'song::artista'],
        ['Song', 'Main Artist feat Featuring', 'song::mainartist'],
        ['Song', 'Artist con Otro', 'song::artist'],
        [undefined, undefined, '::'],
    ])('%p / %p → %p', (title, author, expected) => {
        expect(normalizeTrackKey(title, author)).toBe(expected)
    })
})

describe('getGenreFamilies', () => {
    it.each([
        { genres: ['rock'], expected: 'rock_metal' },
        { genres: ['pop'], expected: 'pop' },
        { genres: ['rock', 'house'], expected: ['rock_metal', 'electronic'] },
        { genres: [], expected: undefined },
    ])('maps %p to %p', ({ genres, expected }) => {
        const families = getGenreFamilies(genres)
        if (expected === undefined) {
            expect(families.size).toBe(0)
        } else {
            const expectedList = Array.isArray(expected) ? expected : [expected]
            expectedList.forEach((fam) => {
                expect(families.has(fam)).toBe(true)
            })
        }
    })
})

describe('calculateGenreFamilyPenalty', () => {
    it.each([
        { current: ['rock'], candidate: ['metal'], expected: 0 },
        { current: [], candidate: ['rock'], expected: -0.1 },
        { current: ['hip hop'], candidate: ['rock'], expected: -0.6 },
        { current: ['pop'], candidate: ['jazz'], expected: -0.3 },
    ])('penalty %p/%p → %p', ({ current, candidate, expected }) => {
        expect(calculateGenreFamilyPenalty(current, candidate)).toBe(expected)
    })
})
