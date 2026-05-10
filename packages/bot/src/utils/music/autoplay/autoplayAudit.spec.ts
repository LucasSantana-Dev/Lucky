import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import { AutoplayAuditCollector } from './autoplayAudit'
import type { ScoredTrack } from './candidateCollector'
import type { SessionMood } from './sessionMood'

const infoLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Track',
        author: 'Test Artist',
        url: 'https://example.com/track',
        id: 'track-id',
        durationMS: 180000,
        ...overrides,
    } as Track
}

function createScoredTrack(overrides: Partial<ScoredTrack> = {}): ScoredTrack {
    return {
        track: createTrack(),
        score: 0.8,
        reason: 'test reason',
        ...overrides,
    }
}

describe('AutoplayAuditCollector', () => {
    let collector: AutoplayAuditCollector

    beforeEach(() => {
        collector = new AutoplayAuditCollector()
        infoLogMock.mockClear()
    })

    describe('recordEvaluated', () => {
        it('stores title, artist, score, reason, and status', () => {
            const track = createTrack({ title: 'Song A', author: 'Artist A' })
            collector.recordEvaluated(track, 0.9, 'liked artist', 'accepted')

            const record = captureEmit(collector)
            expect(record.evaluated).toHaveLength(1)
            expect(record.evaluated[0]).toEqual({
                title: 'Song A',
                artist: 'Artist A',
                score: 0.9,
                reason: 'liked artist',
                status: 'accepted',
            })
        })

        it('stores rejected status correctly', () => {
            const track = createTrack({ title: 'Blocked Song', author: 'Blocked Artist' })
            collector.recordEvaluated(track, -Infinity, 'cross-locale reject', 'rejected')

            const record = captureEmit(collector)
            expect(record.evaluated[0]).toMatchObject({
                status: 'rejected',
                reason: 'cross-locale reject',
            })
        })

        it('accumulates multiple entries in order', () => {
            const t1 = createTrack({ title: 'First', author: 'A1' })
            const t2 = createTrack({ title: 'Second', author: 'A2' })
            const t3 = createTrack({ title: 'Third', author: 'A3' })

            collector.recordEvaluated(t1, 0.9, 'reason 1', 'accepted')
            collector.recordEvaluated(t2, 0.5, 'reason 2', 'accepted')
            collector.recordEvaluated(t3, -1, 'reason 3', 'rejected')

            const record = captureEmit(collector)
            expect(record.evaluated).toHaveLength(3)
            expect(record.evaluated[0]!.title).toBe('First')
            expect(record.evaluated[1]!.title).toBe('Second')
            expect(record.evaluated[2]!.title).toBe('Third')
            expect(record.evaluated[2]!.status).toBe('rejected')
        })
    })

    describe('setFinalSelected', () => {
        it('maps ScoredTrack array to selected entries', () => {
            const scored: ScoredTrack[] = [
                createScoredTrack({
                    track: createTrack({ title: 'Pick A', author: 'Artist X' }),
                    score: 0.95,
                    reason: 'top pick',
                }),
                createScoredTrack({
                    track: createTrack({ title: 'Pick B', author: 'Artist Y' }),
                    score: 0.85,
                    reason: 'second pick',
                }),
            ]

            collector.setFinalSelected(scored)

            const record = captureEmit(collector)
            expect(record.selected).toHaveLength(2)
            expect(record.selected[0]).toEqual({
                title: 'Pick A',
                artist: 'Artist X',
                score: 0.95,
                reason: 'top pick',
            })
            expect(record.selected[1]).toEqual({
                title: 'Pick B',
                artist: 'Artist Y',
                score: 0.85,
                reason: 'second pick',
            })
        })

        it('produces empty selected when called with empty array', () => {
            collector.setFinalSelected([])
            const record = captureEmit(collector)
            expect(record.selected).toHaveLength(0)
        })
    })

    describe('emit', () => {
        it('calls infoLog with a well-formed AutoplayAuditRecord', () => {
            const beforeEmit = Date.now()
            collector.emit('guild-123', 'seed-track', null, { spotify: 3 }, 450)
            const afterEmit = Date.now()

            expect(infoLogMock).toHaveBeenCalledTimes(1)
            const { data } = infoLogMock.mock.calls[0]![0] as { message: string; data: Record<string, unknown> }

            expect(data.guildId).toBe('guild-123')
            expect(data.seed).toBe('seed-track')
            expect(data.durationMs).toBe(450)
            expect(data.sourceCounts).toEqual({ spotify: 3 })
            expect(data.timestamp).toBeGreaterThanOrEqual(beforeEmit)
            expect(data.timestamp).toBeLessThanOrEqual(afterEmit)
        })

        it('sets cycleId as guildId-timestamp pattern', () => {
            collector.emit('g-456', 'seed', null, {}, 100)

            const { data } = infoLogMock.mock.calls[0]![0] as { message: string; data: Record<string, unknown> }
            expect(typeof data.cycleId).toBe('string')
            expect((data.cycleId as string).startsWith('g-456-')).toBe(true)
        })

        it('sets sessionMoodSummary to null when sessionMood is null', () => {
            collector.emit('guild-1', 'seed', null, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as { message: string; data: Record<string, unknown> }
            expect(data.sessionMoodSummary).toBeNull()
        })

        it('uses dominantLocale from sessionMood when provided', () => {
            const mood: SessionMood = {
                dominantLocale: 'pt-BR',
                restless: false,
                trackCount: 5,
                localeWeights: new Map([['pt-BR', 5]]),
            }

            collector.emit('guild-1', 'seed', mood, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as { message: string; data: Record<string, unknown> }
            expect(data.sessionMoodSummary).toBe('pt-BR')
        })

        it('includes evaluated and selected entries in the record', () => {
            const track = createTrack({ title: 'T1', author: 'A1' })
            collector.recordEvaluated(track, 0.7, 'reason', 'accepted')
            collector.setFinalSelected([createScoredTrack({ track, score: 0.7, reason: 'reason' })])

            collector.emit('guild-1', 'seed', null, {}, 200)

            const { data } = infoLogMock.mock.calls[0]![0] as { message: string; data: Record<string, unknown> }
            expect((data.evaluated as unknown[]).length).toBe(1)
            expect((data.selected as unknown[]).length).toBe(1)
        })

        it('logs with message "Autoplay audit"', () => {
            collector.emit('guild-1', 'seed', null, {}, 0)

            const { message } = infoLogMock.mock.calls[0]![0] as { message: string }
            expect(message).toBe('Autoplay audit')
        })
    })
})

function captureEmit(collector: AutoplayAuditCollector) {
    collector.emit('test-guild', 'test-seed', null, {}, 0)
    const call = infoLogMock.mock.calls[infoLogMock.mock.calls.length - 1]![0] as {
        message: string
        data: {
            cycleId: string
            guildId: string
            timestamp: number
            seed: string
            sessionMoodSummary: string | null
            evaluated: Array<{ title: string; artist: string; score: number; reason: string; status: 'accepted' | 'rejected' }>
            selected: Array<{ title: string; artist: string; score: number; reason: string }>
            sourceCounts: Record<string, number>
            durationMs: number
        }
    }
    return call.data
}
