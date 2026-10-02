import { describe, expect, test } from 'vitest'
import { inferApiBase } from './apiBase'

describe('inferApiBase', () => {
    test('uses configured VITE_API_BASE_URL when provided', () => {
        const result = inferApiBase('https://custom.example.com/api', {
            protocol: 'https:',
            hostname: 'lucky.lucassantana.tech',
        })

        expect(result).toBe('https://custom.example.com/api')
    })

    test.each([
        {
            hostname: 'panel.luk-homeserver.com.br',
            expected: 'https://api.luk-homeserver.com.br/api',
        },
    ])('infers API base for $hostname', ({ hostname, expected }) => {
        const result = inferApiBase(undefined, {
            protocol: 'https:',
            hostname,
        })

        expect(result).toBe(expected)
    })

    test('falls back to /api when location is unavailable', () => {
        expect(inferApiBase()).toBe('/api')
    })

    test.each(['lucky.lucassantana.tech', 'lucassantana.tech'])(
        'throws on %s when VITE_API_BASE_URL is missing',
        (hostname) => {
            expect(() =>
                inferApiBase(undefined, { protocol: 'https:', hostname }),
            ).toThrow(/VITE_API_BASE_URL/)
        },
    )

    test('throws on a managed host when VITE_API_BASE_URL is blank', () => {
        expect(() =>
            inferApiBase('   ', {
                protocol: 'https:',
                hostname: 'lucky.lucassantana.tech',
            }),
        ).toThrow(/VITE_API_BASE_URL/)
    })

    test('keeps the relative /api base for localhost dev', () => {
        expect(
            inferApiBase(undefined, {
                protocol: 'http:',
                hostname: 'localhost',
            }),
        ).toBe('/api')
    })
})
