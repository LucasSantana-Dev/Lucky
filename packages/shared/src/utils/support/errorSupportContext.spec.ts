import { describe, expect, it, afterEach } from '@jest/globals'
import { buildErrorSupportContext } from './errorSupportContext'

describe('errorSupportContext', () => {
    const originalEnv = process.env.SUPPORT_URL

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.SUPPORT_URL
        } else {
            process.env.SUPPORT_URL = originalEnv
        }
    })

    describe('buildErrorSupportContext', () => {
        it('returns graceful result when SUPPORT_URL is not set', () => {
            delete process.env.SUPPORT_URL
            const result = buildErrorSupportContext('test-id-123')

            expect(result.supportLink).toBeNull()
            expect(result.footerText).toBe(
                'An error occurred. Please try again or contact support.',
            )
        })

        it('builds correct support link with correlation ID only', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('abc123xy')

            expect(result.supportLink).toBe(
                'https://example.com/support?cid=abc123xy',
            )
            expect(result.footerText).toContain('Error ID: abc123xy')
        })

        it('includes all context fields in the support link', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('abc123xy', {
                guildId: 'guild-456',
                command: '/play',
                errorCategory: 'playback-error',
            })

            expect(result.supportLink).toContain('cid=abc123xy')
            expect(result.supportLink).toContain('guildId=guild-456')
            expect(result.supportLink).toContain('command=%2Fplay') // URL-encoded /
            expect(result.supportLink).toContain('category=playback-error')
        })

        it('omits undefined context fields from the link', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('abc123xy', {
                guildId: 'guild-456',
                // command and errorCategory are undefined
            })

            expect(result.supportLink).toContain('cid=abc123xy')
            expect(result.supportLink).toContain('guildId=guild-456')
            expect(result.supportLink).not.toContain('command=')
            expect(result.supportLink).not.toContain('category=')
        })

        it('includes correct footer text with link', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('xyz789ab')

            expect(result.footerText).toContain('Error ID: xyz789ab')
            expect(result.footerText).toContain('[Report this error]')
            expect(result.footerText).toContain(
                '(https://example.com/support?cid=xyz789ab)',
            )
        })

        it('handles empty context object gracefully', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('test-id', {})

            expect(result.supportLink).toBe(
                'https://example.com/support?cid=test-id',
            )
            expect(result.supportLink).not.toContain('guildId=')
            expect(result.supportLink).not.toContain('command=')
            expect(result.supportLink).not.toContain('category=')
        })

        it('handles context with only errorCategory', () => {
            process.env.SUPPORT_URL = 'https://example.com/support'
            const result = buildErrorSupportContext('error-123', {
                errorCategory: 'timeout-error',
            })

            expect(result.supportLink).toContain('cid=error-123')
            expect(result.supportLink).toContain('category=timeout-error')
            expect(result.supportLink).not.toContain('guildId=')
            expect(result.supportLink).not.toContain('command=')
        })

        it('preserves query params already present on SUPPORT_URL', () => {
            process.env.SUPPORT_URL = 'https://example.com/support?ref=embed'
            const result = buildErrorSupportContext('abc123xy')

            expect(result.supportLink).toContain('ref=embed')
            expect(result.supportLink).toContain('cid=abc123xy')
        })

        it('treats an empty SUPPORT_URL as not configured', () => {
            process.env.SUPPORT_URL = '   '
            const result = buildErrorSupportContext('abc123xy')

            expect(result.supportLink).toBeNull()
        })

        it('degrades gracefully when SUPPORT_URL is malformed', () => {
            process.env.SUPPORT_URL = 'not a url'
            const result = buildErrorSupportContext('abc123xy')

            expect(result.supportLink).toBeNull()
        })
    })
})
