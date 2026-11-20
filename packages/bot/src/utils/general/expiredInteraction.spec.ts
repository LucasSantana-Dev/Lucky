import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const warnLogMock = jest.fn()
const incMock = jest.fn()
const labelsMock = jest.fn(() => ({ inc: incMock }))

jest.mock('@lucky/shared/utils', () => ({
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))
jest.mock('../monitoring/prometheus', () => ({
    interactionExpiredTotal: { labels: (...a: unknown[]) => labelsMock(...a) },
}))

import {
    isExpiredInteractionError,
    recordExpiredInteraction,
} from './expiredInteraction'

describe('isExpiredInteractionError', () => {
    it('matches Discord 10062 Unknown interaction', () => {
        expect(isExpiredInteractionError({ code: 10062 })).toBe(true)
    })

    it('matches 10062 wrapped as the cause of another error', () => {
        const wrapped = new Error('Failed to defer interaction reply', {
            cause: Object.assign(new Error('Unknown interaction'), {
                code: 10062,
            }),
        })
        expect(isExpiredInteractionError(wrapped)).toBe(true)
    })

    it('does not match other failures', () => {
        expect(isExpiredInteractionError(new Error('boom'))).toBe(false)
        expect(isExpiredInteractionError({ code: 50013 })).toBe(false)
        expect(isExpiredInteractionError(undefined)).toBe(false)
        expect(
            isExpiredInteractionError(
                new Error('x', { cause: new Error('y') }),
            ),
        ).toBe(false)
    })
})

describe('recordExpiredInteraction', () => {
    beforeEach(() => jest.clearAllMocks())

    it('counts per source and logs a warning', () => {
        recordExpiredInteraction('play', 'g1')

        expect(labelsMock).toHaveBeenCalledWith('play')
        expect(incMock).toHaveBeenCalledTimes(1)
        expect(warnLogMock).toHaveBeenCalledTimes(1)
    })
})
