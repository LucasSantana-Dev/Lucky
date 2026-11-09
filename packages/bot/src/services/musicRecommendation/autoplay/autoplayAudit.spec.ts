import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import { AutoplayAuditCollector } from './autoplayAudit'
import type { ScoredTrack } from './candidateCollector'
import { upsertScoredCandidate } from './candidateContracts'
import type { SessionMood } from './sessionMood'

const infoLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

// diversitySelector pulls in the prisma-backed services; upsertScoredCandidate
// itself never calls it, only shouldIncludeCandidate does.
jest.mock('./diversitySelector', () => ({
    isDuplicateCandidate: jest.fn(() => false),
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
        basis: { source: 'spotify-rec', signals: [] },
        ...overrides,
    }
}

describe('AutoplayAuditCollector', () => {
    let collector: AutoplayAuditCollector

    describe('with the real upsertScoredCandidate (#2510)', () => {
        it('records accepted and rejected candidates fed through the contract', () => {
            const audit = new AutoplayAuditCollector()
            const candidates = new Map<string, ScoredTrack>()
            upsertScoredCandidate(
                candidates,
                createTrack({ title: 'Ok', author: 'A' }),
                { score: 0.7, source: 'spotify-rec', signals: [] },
                audit,
            )
            upsertScoredCandidate(
                candidates,
                createTrack({ title: 'Bad', author: 'B' }),
                { score: -Infinity, source: 'spotify-rec', signals: [] },
                audit,
            )

            const record = captureEmit(audit)
            expect(record.evaluated.map((e) => e.status)).toEqual([
                'accepted',
                'rejected',
            ])
            expect(record.droppedCount).toBe(0)
        })
    })

    describe('evaluated cap', () => {
        it('keeps the top 50 by score and reports droppedCount', () => {
            const audit = new AutoplayAuditCollector()
            for (let i = 0; i < 60; i++) {
                audit.recordEvaluated(
                    createTrack({ title: `T${i}`, author: 'A' }),
                    i,
                    'r',
                    'accepted',
                )
            }

            const record = captureEmit(audit)
            expect(record.evaluated).toHaveLength(50)
            expect(record.droppedCount).toBe(10)
            expect(record.evaluated[0]!.score).toBe(59)
            expect(
                Math.min(...record.evaluated.map((e) => e.score as number)),
            ).toBe(10)
        })

        it('keeps the top rejects with their veto when trimming (#2957)', () => {
            const audit = new AutoplayAuditCollector()
            for (let i = 0; i < 60; i++) {
                audit.recordEvaluated(
                    createTrack({ title: `T${i}`, author: 'A' }),
                    i,
                    'r',
                    'accepted',
                )
            }
            for (let i = 0; i < 20; i++) {
                audit.recordEvaluated(
                    createTrack({ title: `R${i}`, author: 'B' }),
                    -Infinity,
                    'r',
                    'rejected',
                    'cross-genre',
                )
            }

            const record = captureEmit(audit)
            const rejected = record.evaluated.filter(
                (e) => e.status === 'rejected',
            )
            expect(record.evaluated).toHaveLength(50)
            expect(rejected.map((e) => e.title)).toEqual(
                Array.from({ length: 10 }, (_, i) => `R${i}`),
            )
            expect(
                record.evaluated.filter((e) => e.status === 'accepted'),
            ).toHaveLength(40)
            expect(rejected.every((e) => e.veto === 'cross-genre')).toBe(true)
            expect(rejected.every((e) => e.score === '-Infinity')).toBe(true)
            expect(record.droppedCount).toBe(30)
            expect(record.rejectedCount).toBe(20)
        })

        it('counts every omitted entry when rejects outnumber the cap', () => {
            const audit = new AutoplayAuditCollector()
            for (let i = 0; i < 5; i++) {
                audit.recordEvaluated(
                    createTrack({ title: `T${i}`, author: 'A' }),
                    i,
                    'r',
                    'accepted',
                )
            }
            for (let i = 0; i < 60; i++) {
                audit.recordEvaluated(
                    createTrack({ title: `R${i}`, author: 'B' }),
                    -Infinity,
                    'r',
                    'rejected',
                    'disliked',
                )
            }

            const record = captureEmit(audit)
            expect(record.evaluated).toHaveLength(15)
            expect(record.droppedCount).toBe(50)
            expect(record.rejectedCount).toBe(60)
        })

        it('reports rejectedCount without trimming', () => {
            const audit = new AutoplayAuditCollector()
            audit.recordEvaluated(createTrack(), -Infinity, 'r', 'rejected')
            audit.recordEvaluated(createTrack(), 0.5, 'r', 'accepted')

            const record = captureEmit(audit)
            expect(record.rejectedCount).toBe(1)
            expect(record.droppedCount).toBe(0)
        })
    })

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
            const track = createTrack({
                title: 'Blocked Song',
                author: 'Blocked Artist',
            })
            collector.recordEvaluated(
                track,
                -Infinity,
                'cross-locale reject',
                'rejected',
            )

            const record = captureEmit(collector)
            expect(record.evaluated[0]).toMatchObject({
                status: 'rejected',
                reason: 'cross-locale reject',
            })
        })

        it('serialises a hard-reject score so JSON keeps it distinct from missing (#2957)', () => {
            collector.recordEvaluated(
                createTrack({ title: 'Vetoed', author: 'V' }),
                -Infinity,
                'spotify rec',
                'rejected',
                'cross-genre',
            )

            const record = captureEmit(collector)
            expect(record.evaluated[0]).toEqual({
                title: 'Vetoed',
                artist: 'V',
                score: '-Infinity',
                reason: 'spotify rec',
                status: 'rejected',
                veto: 'cross-genre',
            })
            const roundTripped = JSON.parse(JSON.stringify(record.evaluated[0]))
            expect(roundTripped.score).toBe('-Infinity')
        })

        it('leaves finite scores numeric and omits veto when none is given', () => {
            collector.recordEvaluated(
                createTrack({ title: 'Fine', author: 'F' }),
                0.4,
                'r',
                'accepted',
            )

            const record = captureEmit(collector)
            expect(record.evaluated[0]!.score).toBe(0.4)
            expect(record.evaluated[0]).not.toHaveProperty('veto')
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
                    basis: {
                        source: 'spotify-rec',
                        signals: ['preferred artist'],
                    },
                }),
                createScoredTrack({
                    track: createTrack({ title: 'Pick B', author: 'Artist Y' }),
                    score: 0.85,
                    basis: { source: 'lastfm-similar', signals: [] },
                }),
            ]

            collector.setFinalSelected(scored)

            const record = captureEmit(collector)
            expect(record.selected).toHaveLength(2)
            expect(record.selected[0]).toEqual({
                title: 'Pick A',
                artist: 'Artist X',
                score: 0.95,
                reason: 'spotify rec • preferred artist',
            })
            expect(record.selected[1]).toEqual({
                title: 'Pick B',
                artist: 'Artist Y',
                score: 0.85,
                reason: 'last.fm similar',
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
            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }

            expect(data.guildId).toBe('guild-123')
            expect(data.seed).toBe('seed-track')
            expect(data.durationMs).toBe(450)
            expect(data.sourceCounts).toEqual({ spotify: 3 })
            expect(data.timestamp).toBeGreaterThanOrEqual(beforeEmit)
            expect(data.timestamp).toBeLessThanOrEqual(afterEmit)
        })

        it('sets cycleId as guildId-timestamp pattern', () => {
            collector.emit('g-456', 'seed', null, {}, 100)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(typeof data.cycleId).toBe('string')
            expect((data.cycleId as string).startsWith('g-456-')).toBe(true)
        })

        it('logs a null sessionMood when no mood was detected', () => {
            collector.emit('guild-1', 'seed', null, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(data.sessionMood).toBeNull()
            expect(data).not.toHaveProperty('sessionMoodSummary')
        })

        it('logs the full mood even when dominantLocale is null (#2957)', () => {
            const mood: SessionMood = {
                dominantLocale: null,
                deepDiveArtist: 'Some Band',
                restless: true,
                preferLong: false,
                preferShort: true,
                recentSkipCount: 4,
            }

            collector.emit('guild-1', 'seed', mood, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(data.sessionMood).toEqual({
                dominantLocale: null,
                deepDiveArtist: 'Some Band',
                restless: true,
                preferLong: false,
                preferShort: true,
                recentSkipCount: 4,
            })
        })

        it('defaults a missing recentSkipCount to 0', () => {
            const mood: SessionMood = {
                dominantLocale: 'spanish',
                deepDiveArtist: null,
                restless: false,
                preferLong: false,
                preferShort: false,
            }

            collector.emit('guild-1', 'seed', mood, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: { sessionMood: { recentSkipCount: number } }
            }
            expect(data.sessionMood.recentSkipCount).toBe(0)
        })

        it('logs the session genre families as a sorted array (#2957)', () => {
            collector.emit(
                'guild-1',
                'seed',
                null,
                {},
                0,
                new Set(['rock_metal', 'rap_hiphop']),
            )

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(data.sessionGenreFamilies).toEqual([
                'rap_hiphop',
                'rock_metal',
            ])
        })

        it('logs an empty sessionGenreFamilies array when none were detected', () => {
            collector.emit('guild-1', 'seed', null, {}, 0)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(data.sessionGenreFamilies).toEqual([])
        })

        it('keeps a skipped source reason in sourceCounts', () => {
            collector.emit(
                'guild-1',
                'seed',
                null,
                { genre: { skipped: true, reason: 'no-guild-genres' } },
                0,
            )

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect(data.sourceCounts).toEqual({
                genre: { skipped: true, reason: 'no-guild-genres' },
            })
        })

        it('includes evaluated and selected entries in the record', () => {
            const track = createTrack({ title: 'T1', author: 'A1' })
            collector.recordEvaluated(track, 0.7, 'reason', 'accepted')
            collector.setFinalSelected([
                createScoredTrack({ track, score: 0.7 }),
            ])

            collector.emit('guild-1', 'seed', null, {}, 200)

            const { data } = infoLogMock.mock.calls[0]![0] as {
                message: string
                data: Record<string, unknown>
            }
            expect((data.evaluated as unknown[]).length).toBe(1)
            expect((data.selected as unknown[]).length).toBe(1)
        })

        it('logs with message "Autoplay audit"', () => {
            collector.emit('guild-1', 'seed', null, {}, 0)

            const { message } = infoLogMock.mock.calls[0]![0] as {
                message: string
            }
            expect(message).toBe('Autoplay audit')
        })
    })
})

function captureEmit(collector: AutoplayAuditCollector) {
    collector.emit('test-guild', 'test-seed', null, {}, 0)
    const call = infoLogMock.mock.calls[
        infoLogMock.mock.calls.length - 1
    ]![0] as {
        message: string
        data: {
            cycleId: string
            guildId: string
            timestamp: number
            seed: string
            sessionMood: Record<string, unknown> | null
            sessionGenreFamilies: string[]
            rejectedCount: number
            droppedCount: number
            evaluated: Array<{
                title: string
                artist: string
                score: number | string
                reason: string
                status: 'accepted' | 'rejected'
                veto?: string
            }>
            selected: Array<{
                title: string
                artist: string
                score: number
                reason: string
            }>
            sourceCounts: Record<string, number>
            durationMs: number
        }
    }
    return call.data
}
