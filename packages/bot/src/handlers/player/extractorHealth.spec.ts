import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const gaugeSetMock = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    musicExtractorDegradedGauge: {
        set: (...args: unknown[]) => gaugeSetMock(...args),
    },
}))

import { isExtractorDegraded, setExtractorDegraded } from './extractorHealth'

describe('extractorHealth', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        setExtractorDegraded('youtube', false)
        jest.clearAllMocks()
    })

    it('reports healthy by default', () => {
        expect(isExtractorDegraded('youtube')).toBe(false)
    })

    it('marks an extractor degraded and updates the gauge', () => {
        setExtractorDegraded('youtube', true)

        expect(isExtractorDegraded('youtube')).toBe(true)
        expect(gaugeSetMock).toHaveBeenCalledWith({ extractor: 'youtube' }, 1)
    })

    it('clears a degraded extractor and updates the gauge', () => {
        setExtractorDegraded('youtube', true)
        setExtractorDegraded('youtube', false)

        expect(isExtractorDegraded('youtube')).toBe(false)
        expect(gaugeSetMock).toHaveBeenLastCalledWith(
            { extractor: 'youtube' },
            0,
        )
    })

    it('tracks extractors independently', () => {
        setExtractorDegraded('youtube', true)

        expect(isExtractorDegraded('youtube')).toBe(true)
        expect(isExtractorDegraded('spotify')).toBe(false)
    })
})
