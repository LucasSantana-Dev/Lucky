import * as Sentry from '@sentry/node'
import {
    safeUrlOrigin,
    scrubUrls,
    captureMessage,
    titleMessageEvent,
    addBreadcrumb,
    monitorCommandExecution,
} from './sentry.js'
import { telemetryLog } from '@lucky/shared/utils'

const mockScope = { addEventProcessor: jest.fn() }

jest.mock('@sentry/node', () => ({
    withScope: jest.fn((callback: (scope: unknown) => void) =>
        callback(mockScope),
    ),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    setContext: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
    telemetryLog: jest.fn(),
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

describe('titleMessageEvent', () => {
    it('falls back to "message" style naming only for untyped exceptions', () => {
        const event = titleMessageEvent(
            {
                exception: {
                    values: [
                        { type: 'TypeError', value: 'boom' },
                        { value: 'x' },
                    ],
                },
            },
            'message',
        )

        expect(event.exception?.values?.map((v) => v.type)).toEqual([
            'TypeError',
            'message',
        ])
    })

    it('leaves an event without an exception unchanged', () => {
        expect(titleMessageEvent({ message: 'hi' }, 'cat')).toEqual({
            message: 'hi',
        })
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
                fingerprint: ['{{ default }}', 'music.youtube-extraction'],
            },
        )
    })

    it('forwards an optional fingerprint to Sentry.captureMessage', () => {
        captureMessage('exhausted', 'warning', undefined, undefined, [
            'bridge',
            'forbidden',
        ])

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'exhausted',
            expect.objectContaining({ fingerprint: ['bridge', 'forbidden'] }),
        )
    })

    it('groups a categorized message by category when no fingerprint is given', () => {
        captureMessage('Top.gg stats POST failed', 'warning', undefined, {
            category: 'topgg.stats',
        })

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'Top.gg stats POST failed',
            expect.objectContaining({
                fingerprint: ['{{ default }}', 'topgg.stats'],
            }),
        )
    })

    it('reads a category passed in extras and promotes it to a tag', () => {
        captureMessage('Top.gg stats POST failed', 'warning', {
            category: 'topgg.stats',
            status: 500,
        })

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'Top.gg stats POST failed',
            expect.objectContaining({
                tags: { category: 'topgg.stats' },
                fingerprint: ['{{ default }}', 'topgg.stats'],
            }),
        )
        const processor = mockScope.addEventProcessor.mock.calls[0][0] as (
            event: Sentry.Event,
        ) => Sentry.Event
        expect(
            processor({ exception: { values: [{ value: 'x' }] } }).exception
                ?.values?.[0]?.type,
        ).toBe('topgg.stats')
    })

    it('keeps the default grouping for a message with no category', () => {
        captureMessage('plain message', 'info')

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'plain message',
            expect.not.objectContaining({ fingerprint: expect.anything() }),
        )
    })

    it('titles the event after its category instead of the wrapper function', () => {
        captureMessage(
            'YouTube extraction exhausted all fallback stages',
            'warning',
            undefined,
            { category: 'music.youtube-extraction' },
            ['youtube-extraction-exhausted', 'empty'],
        )

        const processor = mockScope.addEventProcessor.mock.calls[0][0] as (
            event: Sentry.Event,
        ) => Sentry.Event
        const event = processor({
            exception: {
                values: [
                    {
                        value: 'YouTube extraction exhausted all fallback stages',
                        mechanism: { type: 'generic', synthetic: true },
                    },
                ],
            },
        })

        expect(event.exception?.values?.[0]).toEqual(
            expect.objectContaining({
                type: 'music.youtube-extraction',
                mechanism: { type: 'generic', synthetic: false },
            }),
        )
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            'YouTube extraction exhausted all fallback stages',
            expect.objectContaining({
                fingerprint: ['youtube-extraction-exhausted', 'empty'],
            }),
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

    it('monitorCommandExecution emits command_executed telemetry with no userId', () => {
        monitorCommandExecution('play', 'user-42', 'guild-7')

        expect(telemetryLog).toHaveBeenCalledWith('command_executed', {
            guildId: 'guild-7',
            command: 'play',
        })
        // Never passes userId to telemetryLog, only to Sentry's own context.
        const telemetryCallArgs = (telemetryLog as jest.Mock).mock.calls.flat()
        expect(JSON.stringify(telemetryCallArgs)).not.toContain('user-42')
    })

    it('monitorCommandExecution uses "dm" as the guildId sentinel outside a guild', () => {
        monitorCommandExecution('play', 'user-42')

        expect(telemetryLog).toHaveBeenCalledWith('command_executed', {
            guildId: 'dm',
            command: 'play',
        })
    })

    it('monitorCommandExecution still sets the Sentry command context', () => {
        monitorCommandExecution('play', 'user-42', 'guild-7')

        expect(Sentry.setContext).toHaveBeenCalledWith('command', {
            name: 'play',
            userId: 'user-42',
            guildId: 'guild-7',
        })
    })
})
