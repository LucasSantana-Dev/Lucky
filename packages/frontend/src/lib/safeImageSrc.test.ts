import { describe, test, expect } from 'vitest'
import { safeImageSrc } from './safeImageSrc'

describe('safeImageSrc', () => {
    test('accepts an https URL and trims it', () => {
        expect(safeImageSrc('  https://cdn.example.com/a.png ')).toBe(
            'https://cdn.example.com/a.png',
        )
    })

    test('rejects javascript and data URLs by default', () => {
        expect(safeImageSrc('javascript:alert(1)')).toBeNull()
        expect(
            safeImageSrc('data:image/svg+xml,<svg onload=alert(1)>'),
        ).toBeNull()
    })

    test('rejects text that is not a URL', () => {
        expect(safeImageSrc('"><img src=x onerror=alert(1)>')).toBeNull()
        expect(safeImageSrc('')).toBeNull()
    })

    test('accepts blob URLs only when allowed', () => {
        const blob = 'blob:http://localhost/1234'
        expect(safeImageSrc(blob)).toBeNull()
        expect(safeImageSrc(blob, ['blob:'])).toBe(blob)
    })
})
