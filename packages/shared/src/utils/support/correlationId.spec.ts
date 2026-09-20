import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockIsSentryEnabled = jest.fn<() => boolean>()
const mockSetTag = jest.fn()

jest.mock('../monitoring/sentry', () => ({
    isSentryEnabled: mockIsSentryEnabled,
}))

jest.mock('@sentry/node', () => ({
    setTag: mockSetTag,
}))

import { mintCorrelationId, tagCorrelationIdToSentry } from './correlationId'

describe('mintCorrelationId', () => {
    it('mints a non-empty id', () => {
        expect(mintCorrelationId().length).toBeGreaterThan(0)
    })

    it('mints an 8-character id', () => {
        expect(mintCorrelationId()).toHaveLength(8)
    })

    it('mints only URL-safe characters', () => {
        for (let i = 0; i < 50; i++) {
            expect(mintCorrelationId()).toMatch(/^[A-Za-z0-9_-]{8}$/)
        }
    })

    it('mints distinct ids across calls (sufficiently unique)', () => {
        const ids = new Set<string>()
        for (let i = 0; i < 1000; i++) {
            ids.add(mintCorrelationId())
        }
        expect(ids.size).toBeGreaterThanOrEqual(998)
    })
})

describe('tagCorrelationIdToSentry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('sets the Sentry tag when Sentry is enabled', () => {
        mockIsSentryEnabled.mockReturnValue(true)

        tagCorrelationIdToSentry('abc123xy')

        expect(mockSetTag).toHaveBeenCalledWith('correlationId', 'abc123xy')
    })

    it('is a no-op when Sentry is disabled', () => {
        mockIsSentryEnabled.mockReturnValue(false)

        tagCorrelationIdToSentry('abc123xy')

        expect(mockSetTag).not.toHaveBeenCalled()
    })
})
