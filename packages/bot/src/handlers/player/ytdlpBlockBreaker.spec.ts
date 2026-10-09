import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockInc = jest.fn()
const mockSetExtractorDegraded = jest.fn()
const mockIsExtractorDegraded = jest.fn(() => false)

jest.mock('../../utils/monitoring/prometheus', () => ({
    extractionFailuresTotal: { inc: (...args: unknown[]) => mockInc(...args) },
}))

jest.mock('./extractorHealth', () => ({
    setExtractorDegraded: (...args: unknown[]) =>
        mockSetExtractorDegraded(...args),
    isExtractorDegraded: (...args: unknown[]) =>
        mockIsExtractorDegraded(...args),
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
const BOTCHECK = new Error(
    "yt-dlp exited with code 1 - ERROR: [youtube] abc123: Sign in to confirm you're not a bot",
)
const AGE_GATE = new Error(
    'yt-dlp exited with code 1 - ERROR: [youtube] abc123: Sign in to confirm your age',
)

describe('ytdlpBlockBreaker (#2653)', () => {
    beforeEach(() => {
        mockInc.mockReset()
        mockSetExtractorDegraded.mockReset()
        mockIsExtractorDegraded.mockReset()
        mockIsExtractorDegraded.mockReturnValue(false)
        recordYtDlpSuccess()
        mockSetExtractorDegraded.mockReset()
    })

    it.each([
        [FORBIDDEN.message, 'forbidden'],
        [BOTCHECK.message, 'botcheck'],
        [
            'ERROR: [youtube] abc123: Sign in to confirm you\u2019re not a bot',
            'botcheck',
        ],
        [AGE_GATE.message, 'other'],
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

    it('two bot-check failures open the block (#2744)', () => {
        recordYtDlpFailure(BOTCHECK, 1_000)
        recordYtDlpFailure(BOTCHECK, 2_000)

        expect(isYtDlpBlocked(2_000)).toBe(true)
    })

    it('sets degradation gauge when block opens (#2744)', () => {
        recordYtDlpFailure(FORBIDDEN, 1_000)
        expect(mockSetExtractorDegraded).not.toHaveBeenCalledWith(
            'youtube',
            true,
        )

        recordYtDlpFailure(FORBIDDEN, 2_000)

        expect(mockSetExtractorDegraded).toHaveBeenCalledWith('youtube', true)
    })

    it('clears degradation gauge on success (#2744)', () => {
        recordYtDlpFailure(FORBIDDEN, 1_000)
        recordYtDlpFailure(FORBIDDEN, 2_000)
        mockSetExtractorDegraded.mockReset()

        recordYtDlpSuccess()

        expect(mockSetExtractorDegraded).toHaveBeenCalledWith('youtube', false)
    })

    it('two age-gate failures do not open the block', () => {
        recordYtDlpFailure(AGE_GATE, 1_000)
        recordYtDlpFailure(AGE_GATE, 2_000)

        expect(isYtDlpBlocked(2_000)).toBe(false)
        expect(mockSetExtractorDegraded).not.toHaveBeenCalled()
    })

    it('a success with the breaker closed leaves the gauge alone', () => {
        recordYtDlpSuccess()

        expect(mockSetExtractorDegraded).not.toHaveBeenCalled()
    })

    it('does not clear a degraded state it did not set (boot-time registration failure)', () => {
        mockIsExtractorDegraded.mockReturnValue(true)
        recordYtDlpFailure(FORBIDDEN, 1_000)
        recordYtDlpFailure(FORBIDDEN, 2_000)

        recordYtDlpSuccess()
        isYtDlpBlocked(2_000 + YTDLP_BLOCK_COOLDOWN_MS)

        expect(mockSetExtractorDegraded).not.toHaveBeenCalled()
    })

    it('clears the gauge when the block expires', () => {
        recordYtDlpFailure(FORBIDDEN, 1_000)
        recordYtDlpFailure(FORBIDDEN, 2_000)
        mockSetExtractorDegraded.mockReset()

        expect(isYtDlpBlocked(2_000 + YTDLP_BLOCK_COOLDOWN_MS - 1)).toBe(true)
        expect(mockSetExtractorDegraded).not.toHaveBeenCalled()

        expect(isYtDlpBlocked(2_000 + YTDLP_BLOCK_COOLDOWN_MS)).toBe(false)
        expect(mockSetExtractorDegraded).toHaveBeenCalledTimes(1)
        expect(mockSetExtractorDegraded).toHaveBeenCalledWith('youtube', false)
    })

    it('clears the gauge at expiry even when the bot is idle', () => {
        jest.useFakeTimers()
        try {
            const now = Date.now()
            recordYtDlpFailure(FORBIDDEN, now)
            recordYtDlpFailure(FORBIDDEN, now)
            mockSetExtractorDegraded.mockReset()

            jest.advanceTimersByTime(YTDLP_BLOCK_COOLDOWN_MS)

            expect(mockSetExtractorDegraded).toHaveBeenCalledWith(
                'youtube',
                false,
            )
        } finally {
            jest.useRealTimers()
        }
    })
})
