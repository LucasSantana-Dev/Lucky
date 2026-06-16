import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import {
    getFrontendOrigins,
    getPrimaryFrontendUrl,
} from '../../../src/utils/frontendOrigin'

const DEFAULT = 'http://localhost:5173'
const ENV_KEY = 'WEBAPP_FRONTEND_URL'

describe('frontendOrigin', () => {
    let saved: string | undefined

    beforeEach(() => {
        saved = process.env[ENV_KEY]
    })

    afterEach(() => {
        if (saved === undefined) delete process.env[ENV_KEY]
        else process.env[ENV_KEY] = saved
    })

    test('falls back to the localhost default when env is unset', () => {
        delete process.env[ENV_KEY]
        expect(getFrontendOrigins()).toEqual([DEFAULT])
        expect(getPrimaryFrontendUrl()).toBe(DEFAULT)
    })

    test('returns a single configured origin', () => {
        process.env[ENV_KEY] = 'https://app.example.com'
        expect(getFrontendOrigins()).toEqual(['https://app.example.com'])
        expect(getPrimaryFrontendUrl()).toBe('https://app.example.com')
    })

    test('splits comma-separated origins and trims surrounding whitespace', () => {
        // Pins `.split(',')` (an empty-string mutant splits into characters)
        // and `.map(trim)` (removing it leaves the leading/trailing spaces).
        process.env[ENV_KEY] = 'https://a.example.com ,  https://b.example.com'
        expect(getFrontendOrigins()).toEqual([
            'https://a.example.com',
            'https://b.example.com',
        ])
        expect(getPrimaryFrontendUrl()).toBe('https://a.example.com')
    })

    test('drops empty segments between separators', () => {
        // Pins `.filter((o) => o.length > 0)` — a `>= 0` or removed mutant
        // would keep the empty strings.
        process.env[ENV_KEY] = 'https://a.example.com,, ,https://b.example.com'
        expect(getFrontendOrigins()).toEqual([
            'https://a.example.com',
            'https://b.example.com',
        ])
    })

    test('falls back to the default when the value is only separators/whitespace', () => {
        // Pins the `origins.length > 0 ? origins : [DEFAULT]` fallback: after
        // filtering this yields [], so the default must be returned.
        process.env[ENV_KEY] = ' , , '
        expect(getFrontendOrigins()).toEqual([DEFAULT])
        expect(getPrimaryFrontendUrl()).toBe(DEFAULT)
    })
})
