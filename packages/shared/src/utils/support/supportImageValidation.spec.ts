import { describe, expect, it } from '@jest/globals'
import { validateSupportImage } from './supportImageValidation'

describe('supportImageValidation', () => {
    describe('validateSupportImage', () => {
        it('accepts a valid PNG image', () => {
            const result = validateSupportImage({
                size: 1024 * 1024, // 1 MB
                mimetype: 'image/png',
            })

            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('accepts a valid JPEG image', () => {
            const result = validateSupportImage({
                size: 2 * 1024 * 1024, // 2 MB
                mimetype: 'image/jpeg',
            })

            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('accepts a valid WebP image', () => {
            const result = validateSupportImage({
                size: 512 * 1024, // 512 KB
                mimetype: 'image/webp',
            })

            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('accepts exactly 5 MB (boundary)', () => {
            const result = validateSupportImage({
                size: 5 * 1024 * 1024,
                mimetype: 'image/png',
            })

            expect(result.valid).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('rejects image exceeding 5 MB', () => {
            const result = validateSupportImage({
                size: 5.1 * 1024 * 1024,
                mimetype: 'image/png',
            })

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Image exceeds 5 MB limit')
        })

        it('rejects unsupported MIME type (GIF)', () => {
            const result = validateSupportImage({
                size: 1024 * 1024,
                mimetype: 'image/gif',
            })

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Unsupported image type')
        })

        it('rejects unsupported MIME type (BMP)', () => {
            const result = validateSupportImage({
                size: 1024 * 1024,
                mimetype: 'image/bmp',
            })

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Unsupported image type')
        })

        it('rejects missing size', () => {
            const result = validateSupportImage({
                mimetype: 'image/png',
            })

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Missing image size or type')
        })

        it('rejects missing MIME type', () => {
            const result = validateSupportImage({
                size: 1024 * 1024,
            })

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Missing image size or type')
        })

        it('rejects missing both size and MIME type', () => {
            const result = validateSupportImage({})

            expect(result.valid).toBe(false)
            expect(result.error).toContain('Missing image size or type')
        })
    })
})
