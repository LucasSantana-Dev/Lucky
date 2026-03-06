import { describe, test, expect } from '@jest/globals'

function hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16)
}

function decimalToHex(decimal: number): string {
    return '#' + decimal.toString(16).toUpperCase().padStart(6, '0')
}

function validateEmbedData(embedData: {
    title?: string
    description?: string
    color?: string
    footer?: string
    thumbnail?: string
    image?: string
    fields?: { name: string; value: string; inline?: boolean }[]
}): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const hasContent =
        embedData.title || embedData.description || embedData.fields?.length

    if (!hasContent) {
        errors.push('Embed must have at least a title, description, or fields')
    }
    if (embedData.title && embedData.title.length > 256) {
        errors.push('Title must be 256 characters or less')
    }
    if (embedData.description && embedData.description.length > 4096) {
        errors.push('Description must be 4096 characters or less')
    }
    if (embedData.color && !/^#[0-9A-Fa-f]{6}$/.test(embedData.color)) {
        errors.push('Color must be a valid hex code (e.g. #5865F2)')
    }

    return { valid: errors.length === 0, errors }
}

describe('EmbedBuilderService utility functions', () => {
    describe('validateEmbedData', () => {
        test('should validate correct embed data', () => {
            const result = validateEmbedData({
                title: 'Test',
                description: 'Hello world',
            })

            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
        })

        test('should reject embed data with no content', () => {
            const result = validateEmbedData({})

            expect(result.valid).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
        })

        test('should reject title over 256 characters', () => {
            const result = validateEmbedData({
                title: 'a'.repeat(257),
            })

            expect(result.valid).toBe(false)
        })

        test('should reject invalid hex color', () => {
            const result = validateEmbedData({
                title: 'Test',
                color: 'notahex',
            })

            expect(result.valid).toBe(false)
        })

        test('should accept valid hex color', () => {
            const result = validateEmbedData({
                title: 'Test',
                color: '#5865F2',
            })

            expect(result.valid).toBe(true)
        })
    })

    describe('hexToDecimal', () => {
        test('should convert hex to decimal', () => {
            expect(hexToDecimal('#5865F2')).toBe(5793266)
            expect(hexToDecimal('#FF0000')).toBe(16711680)
            expect(hexToDecimal('#000000')).toBe(0)
            expect(hexToDecimal('#FFFFFF')).toBe(16777215)
        })

        test('should handle hex without hash', () => {
            expect(hexToDecimal('5865F2')).toBe(5793266)
        })
    })

    describe('decimalToHex', () => {
        test('should convert decimal to hex', () => {
            expect(decimalToHex(5793266)).toBe('#5865F2')
            expect(decimalToHex(16711680)).toBe('#FF0000')
            expect(decimalToHex(0)).toBe('#000000')
            expect(decimalToHex(16777215)).toBe('#FFFFFF')
        })
    })
})
