jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { infoLog } from '@lucky/shared/utils'
import { AutoplayAuditCollector } from '../../../src/utils/music/autoplay/autoplayAudit'
import type { AutoplayAuditRecord } from '../../../src/utils/music/autoplay/autoplayAudit'
import { createMockTrack } from '../../__mocks__/discordPlayer'
import type { ScoredTrack } from '../../../src/utils/music/autoplay/candidateCollector'

const mockInfoLog = infoLog as jest.Mock

function makeScoredTrack(overrides: Partial<ScoredTrack> = {}): ScoredTrack {
    return {
        track: createMockTrack(),
        score: 0.8,
        reason: 'test reason',
        ...overrides,
    }
}

describe('AutoplayAuditCollector', () => {
    let collector: AutoplayAuditCollector

    beforeEach(() => {
        jest.clearAllMocks()
        collector = new AutoplayAuditCollector()
    })

    describe('recordEvaluated', () => {
        it('records an accepted candidate', () => {
            const track = createMockTrack({ title: 'Good Song', author: 'Artist A' })
            collector.recordEvaluated(track, 0.9, 'spotify rec', 'accepted')

            collector.emit('guild1', 'seed-title', null, {}, 100)

            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.evaluated).toHaveLength(1)
            expect(record.evaluated[0]).toMatchObject({
                title: 'Good Song',
                artist: 'Artist A',
                score: 0.9,
                reason: 'spotify rec',
                status: 'accepted',
            })
        })

        it('records a rejected candidate with non-finite score', () => {
            const track = createMockTrack({ title: 'Blocked Song', author: 'Artist B' })
            collector.recordEvaluated(track, -Infinity, 'cross-locale veto', 'rejected')

            collector.emit('guild1', 'seed-title', null, {}, 100)

            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.evaluated).toHaveLength(1)
            expect(record.evaluated[0]).toMatchObject({
                title: 'Blocked Song',
                artist: 'Artist B',
                score: -Infinity,
                status: 'rejected',
            })
        })

        it('accumulates multiple candidates', () => {
            collector.recordEvaluated(createMockTrack({ title: 'Track 1' }), 0.8, 'r1', 'accepted')
            collector.recordEvaluated(createMockTrack({ title: 'Track 2' }), -Infinity, 'r2', 'rejected')
            collector.recordEvaluated(createMockTrack({ title: 'Track 3' }), 0.5, 'r3', 'accepted')

            collector.emit('g', 's', null, {}, 50)

            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.evaluated).toHaveLength(3)
        })
    })

    describe('setFinalSelected', () => {
        it('maps scored tracks to selected shape', () => {
            const scored = makeScoredTrack({
                track: createMockTrack({ title: 'Selected', author: 'Artist X' }),
                score: 1.1,
                reason: 'top pick',
            })
            collector.setFinalSelected([scored])

            collector.emit('g', 's', null, {}, 50)

            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.selected).toHaveLength(1)
            expect(record.selected[0]).toMatchObject({
                title: 'Selected',
                artist: 'Artist X',
                score: 1.1,
                reason: 'top pick',
            })
        })

        it('defaults to empty selected if never called', () => {
            collector.emit('g', 's', null, {}, 50)
            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.selected).toEqual([])
        })
    })

    describe('emit', () => {
        it('produces a correctly shaped AutoplayAuditRecord', () => {
            jest.useFakeTimers()
            jest.setSystemTime(1_700_000_000_000)

            collector.emit('guild-42', 'My Song', null, { recommendation: 3, lastfm: 2 }, 250)

            const call = mockInfoLog.mock.calls[0][0]
            expect(call.message).toBe('Autoplay audit')
            const record = call.data as AutoplayAuditRecord
            expect(record.guildId).toBe('guild-42')
            expect(record.seed).toBe('My Song')
            expect(record.cycleId).toMatch(/^guild-42-/)
            expect(record.timestamp).toBe(1_700_000_000_000)
            expect(record.sessionMoodSummary).toBeNull()
            expect(record.sourceCounts).toEqual({ recommendation: 3, lastfm: 2 })
            expect(record.durationMs).toBe(250)

            jest.useRealTimers()
        })

        it('includes sessionMoodSummary from dominantLocale', () => {
            const mood = { dominantLocale: 'en-US' } as Parameters<typeof collector.emit>[2]
            collector.emit('g', 's', mood, {}, 10)

            const record = mockInfoLog.mock.calls[0][0].data as AutoplayAuditRecord
            expect(record.sessionMoodSummary).toBe('en-US')
        })

        it('calls infoLog exactly once per emit', () => {
            collector.emit('g', 's', null, {}, 10)
            collector.emit('g', 's', null, {}, 10)
            expect(mockInfoLog).toHaveBeenCalledTimes(2)
        })
    })
})
