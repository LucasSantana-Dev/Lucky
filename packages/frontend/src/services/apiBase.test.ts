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

    test('uses same-origin /api for lucky.lucassantana.tech', () => {
        const result = inferApiBase(undefined, {
            protocol: 'https:',
            hostname: 'lucky.lucassantana.tech',
        })

        expect(result).toBe('/api')
    })

    test('uses same-origin /api for lucassantana.tech', () => {
        const result = inferApiBase(undefined, {
            protocol: 'https:',
            hostname: 'lucassantana.tech',
        })

        expect(result).toBe('/api')
    })

    test('uses homeserver api host for luk-homeserver domains', () => {
        const result = inferApiBase(undefined, {
            protocol: 'https:',
            hostname: 'panel.luk-homeserver.com.br',
        })

        expect(result).toBe('https://api.luk-homeserver.com.br/api')
    })

    test('falls back to /api when location is unavailable', () => {
        expect(inferApiBase()).toBe('/api')
    })
})
