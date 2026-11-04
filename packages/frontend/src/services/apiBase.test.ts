import { describe, expect, test, vi, afterEach } from 'vitest'
import { inferApiBase } from './apiBase'

describe('inferApiBase', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('uses configured VITE_API_BASE_URL when provided', () => {
        const result = inferApiBase('https://custom.example.com/api', {
            protocol: 'https:',
            hostname: 'lucky.lucassantana.tech',
        })

        expect(result).toBe('https://custom.example.com/api')
    })

    test.each([
        {
            hostname: 'lucky.lucassantana.tech',
            expected: '/api',
        },
        {
            hostname: 'lucassantana.tech',
            expected: '/api',
        },
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

    test('logs console.error on managed host with no configured base', () => {
        const consoleSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)

        const result = inferApiBase(undefined, {
            protocol: 'https:',
            hostname: 'lucky.lucassantana.tech',
        })

        expect(result).toBe('/api')
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('VITE_API_BASE_URL is not set'),
            'lucky.lucassantana.tech',
        )
    })

    test('no console.error when configured base is provided on managed host', () => {
        const consoleSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)

        inferApiBase('https://api.lucassantana.tech/api', {
            protocol: 'https:',
            hostname: 'lucky.lucassantana.tech',
        })

        expect(consoleSpy).not.toHaveBeenCalled()
    })
})
