import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockInc = jest.fn()

jest.mock('../../utils/monitoring/prometheus', () => ({
    extractionFailuresTotal: { inc: (...args: unknown[]) => mockInc(...args) },
}))

import {
    FORBIDDEN_WINDOW_MS,
    YTDLP_BLOCK_COOLDOWN_MS,
    classifyYtDlpFailure,
    isYtDlpBlocked,
    recordYtDlpFailure,
    recordYtDlpSuccess,
} from './ytdlpBlockBreaker'

const FORBIDDEN = new Error(
    'yt-dlp exited with code 1 - ERROR: unable to download video data: HTTP Error 403: Forbidden',
)

describe('ytdlpBlockBreaker (#2653)', () => {
    beforeEach(() => {
        mockInc.mockReset()
        recordYtDlpSuccess()
    })

    it.each([
        [FORBIDDEN.message, 'forbidden'],
        ['yt-dlp exited without output (code 0)', 'empty'],
        ['yt-dlp: timed out waiting for stream start', 'timeout'],
        ['yt-dlp: domain not in allowlist: example.com', 'other'],
    ])('classifies "%s" as %s', (message, type) => {
        expect(classifyYtDlpFailure(new Error(message))).toBe(type)
    })

    it('counts every failure by type', () => {
        recordYtDlpFailure(
            new Error('yt-dlp exited without output (code 0)'),
            0,
        )

        expect(mockInc).toHaveBeenCalledWith({ type: 'empty' })
    })

    it('opens after two consecutive 403s and stays open for the cooldown', () => {
        recordYtDlpFailure(FORBIDDEN, 1_000)
        expect(isYtDlpBlocked(1_000)).toBe(false)

        recordYtDlpFailure(FORBIDDEN, 2_000)
        expect(isYtDlpBlocked(2_000)).toBe(true)
        expect(isYtDlpBlocked(2_000 + YTDLP_BLOCK_COOLDOWN_MS - 1)).toBe(true)
        expect(isYtDlpBlocked(2_000 + YTDLP_BLOCK_COOLDOWN_MS)).toBe(false)
    })

    it('does not open on non-403 failures', () => {
        for (let i = 0; i < 5; i++) {
            recordYtDlpFailure(new Error('yt-dlp: timed out'), i)
        }

        expect(isYtDlpBlocked(5)).toBe(false)
    })

    it('a success resets the streak', () => {
        recordYtDlpFailure(FORBIDDEN, 1)
        recordYtDlpSuccess()
        recordYtDlpFailure(FORBIDDEN, 3)

        expect(isYtDlpBlocked(3)).toBe(false)
    })

    it('after the cooldown, one more 403 reopens it (half-open probe)', () => {
        recordYtDlpFailure(FORBIDDEN, 0)
        recordYtDlpFailure(FORBIDDEN, 0)
        const probeAt = YTDLP_BLOCK_COOLDOWN_MS

        recordYtDlpFailure(FORBIDDEN, probeAt)

        expect(isYtDlpBlocked(probeAt)).toBe(true)
    })

    it('a lone 403 long after the last one does not reopen it', () => {
        recordYtDlpFailure(FORBIDDEN, 0)
        recordYtDlpFailure(FORBIDDEN, 0)
        const later = FORBIDDEN_WINDOW_MS

        recordYtDlpFailure(FORBIDDEN, later)

        expect(isYtDlpBlocked(later)).toBe(false)
    })

    it('two 403s further apart than the window do not open it', () => {
        recordYtDlpFailure(FORBIDDEN, 0)
        recordYtDlpFailure(FORBIDDEN, FORBIDDEN_WINDOW_MS)

        expect(isYtDlpBlocked(FORBIDDEN_WINDOW_MS)).toBe(false)
    })

    it('a non-403 failure between two 403s neither counts nor breaks the streak', () => {
        recordYtDlpFailure(FORBIDDEN, 1)
        recordYtDlpFailure(new Error('yt-dlp: timed out'), 2)
        recordYtDlpFailure(FORBIDDEN, 3)

        expect(isYtDlpBlocked(3)).toBe(true)
    })
})
