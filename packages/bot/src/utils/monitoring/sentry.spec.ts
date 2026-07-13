import * as Sentry from '@sentry/node'
import {
    safeUrlOrigin,
    scrubUrls,
    captureMessage,
    addBreadcrumb,
} from './sentry.js'

jest.mock('@sentry/node', () => ({
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
}))

describe('safeUrlOrigin', () => {
    it('returns the origin for a valid URL, dropping credential-bearing path/query', () => {
        expect(
            safeUrlOrigin('https://www.youtube.com/watch?v=abc&sig=secret'),
        ).toBe('https://www.youtube.com')
    })

    it('returns a placeholder for non-string input', () => {
        expect(safeUrlOrigin(undefined)).toBe('invalid-url')
        expect(safeUrlOrigin(123)).toBe('invalid-url')
    })

    it('returns a placeholder for a malformed URL', () => {
        expect(safeUrlOrigin('not a url')).toBe('invalid-url')
    })
})

describe('scrubUrls', () => {
    it('replaces a tokenized URL embedded in text with just its origin', () => {
        const msg =
            'ERROR: unable to download https://rr3---sn-abc.googlevideo.com/videoplayback?sig=SECRET&expire=123: HTTP 403'
        const scrubbed = scrubUrls(msg)
        expect(scrubbed).not.toContain('SECRET')
        expect(scrubbed).not.toContain('sig=')
        expect(scrubbed).toContain('https://rr3---sn-abc.googlevideo.com')
        expect(scrubbed).toContain('HTTP 403')
    })

    it('scrubs multiple URLs and leaves URL-free text unchanged', () => {
        expect(scrubUrls('a https://x.com/p?t=1 b http://y.io/q#z c')).toBe(
            'a https://x.com b http://y.io c',
        )
        expect(scrubUrls('no urls here')).toBe('no urls here')
    })

    it('scrubs uppercase url schemes (http:// and https://)', () => {
        expect(scrubUrls('Error: HTTPS://example.com/secret?token=ABC')).toBe(
            'Error: https://example.com',
        )
        expect(scrubUrls('HTTP://api.test.io/endpoint?key=XYZ')).toBe(
            'http://api.test.io',
        )
    })
})

describe('sentry telemetry helpers', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SENTRY_DSN: 'https://key@example.ingest.sentry.io/1',
            NODE_ENV: 'production',
        }
        jest.clearAllMocks()
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('forwards tags to Sentry.captureMessage', () => {
        captureMessage(
            'YouTube extraction failed',
            'warning',
            { url: 'https://www.youtube.com' },
            { category: 'music.youtube-extraction', stage: 'yt-dlp-url' },
        )

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'YouTube extraction failed',
            {
                level: 'warning',
                extra: { url: 'https://www.youtube.com' },
                tags: {
                    category: 'music.youtube-extraction',
                    stage: 'yt-dlp-url',
                },
            },
        )
    })

    it('forwards breadcrumb data to Sentry.addBreadcrumb', () => {
        addBreadcrumb(
            'extraction failed',
            'music.youtube-extraction',
            'warning',
            {
                url: 'https://www.youtube.com',
            },
        )

        expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'extraction failed',
                category: 'music.youtube-extraction',
                level: 'warning',
                data: { url: 'https://www.youtube.com' },
            }),
        )
    })
})
