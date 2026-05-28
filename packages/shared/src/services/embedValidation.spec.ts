import { describe, it, expect } from '@jest/globals'
import {
    validateEmbedData,
    hexToDecimal,
    decimalToHex,
} from './embedValidation'

describe('validateEmbedData', () => {
    it('returns valid for embed with title only', () => {
        const result = validateEmbedData({ title: 'Hello' })
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })

    it('returns valid for embed with description only', () => {
        const result = validateEmbedData({ description: 'Some description' })
        expect(result.valid).toBe(true)
    })

    it('returns valid for embed with fields only', () => {
        const result = validateEmbedData({
            fields: [{ name: 'f', value: 'v' }],
        })
        expect(result.valid).toBe(true)
    })

    it('returns invalid when no title, description, or fields', () => {
        const result = validateEmbedData({})
        expect(result.valid).toBe(false)
        expect(result.errors).toContain(
            'Embed must have at least a title, description, or fields',
        )
    })

    it('returns invalid when fields is empty array', () => {
        const result = validateEmbedData({ fields: [] })
        expect(result.valid).toBe(false)
    })

    it('returns invalid when title exceeds 256 characters', () => {
        const result = validateEmbedData({ title: 'a'.repeat(257) })
        expect(result.valid).toBe(false)
        expect(result.errors).toContain('Title must be 256 characters or less')
    })

    it('returns valid when title is exactly 256 characters', () => {
        const result = validateEmbedData({ title: 'a'.repeat(256) })
        expect(result.valid).toBe(true)
    })

    it('returns invalid when description exceeds 4096 characters', () => {
        const result = validateEmbedData({
            title: 'T',
            description: 'a'.repeat(4097),
        })
        expect(result.valid).toBe(false)
        expect(result.errors).toContain(
            'Description must be 4096 characters or less',
        )
    })

    it('returns valid when description is exactly 4096 characters', () => {
        const result = validateEmbedData({ description: 'a'.repeat(4096) })
        expect(result.valid).toBe(true)
    })

    it('returns invalid for color without hash prefix', () => {
        const result = validateEmbedData({ title: 'T', color: '5865F2' })
        expect(result.valid).toBe(false)
        expect(result.errors).toContain(
            'Color must be a valid hex code (e.g. #5865F2)',
        )
    })

    it('returns invalid for color with wrong length', () => {
        const result = validateEmbedData({ title: 'T', color: '#FFF' })
        expect(result.valid).toBe(false)
    })

    it('returns valid for correct hex color', () => {
        const result = validateEmbedData({ title: 'T', color: '#5865F2' })
        expect(result.valid).toBe(true)
    })

    it('returns valid for lowercase hex color', () => {
        const result = validateEmbedData({ title: 'T', color: '#5865f2' })
        expect(result.valid).toBe(true)
    })

    it('accumulates multiple errors', () => {
        const result = validateEmbedData({
            title: 'a'.repeat(257),
            color: 'bad',
        })
        expect(result.errors).toHaveLength(2)
    })
})

describe('hexToDecimal', () => {
    it('converts hex without hash to decimal', () => {
        expect(hexToDecimal('FF0000')).toBe(16711680)
    })

    it('converts hex with hash to decimal', () => {
        expect(hexToDecimal('#5865F2')).toBe(parseInt('5865F2', 16))
    })

    it('converts #000000 to 0', () => {
        expect(hexToDecimal('#000000')).toBe(0)
    })
})

describe('decimalToHex', () => {
    it('converts decimal to hex string with hash prefix', () => {
        expect(decimalToHex(16711680)).toBe('#FF0000')
    })

    it('pads short hex values to 6 digits', () => {
        expect(decimalToHex(0)).toBe('#000000')
    })

    it('round-trips with hexToDecimal', () => {
        const original = '#5865F2'
        expect(decimalToHex(hexToDecimal(original))).toBe(original)
    })
})
