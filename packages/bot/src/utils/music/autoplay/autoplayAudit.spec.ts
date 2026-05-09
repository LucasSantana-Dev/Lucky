import { jest } from '@jest/globals'
import type { Track } from 'discord-player'
import { AutoplayAuditCollector } from './autoplayAudit'

jest.mock('@lucky/shared/utils', () => ({
    infoLog: jest.fn(),
}))

function makeTrack(title = 'Test Song', author = 'Test Artist'): Track {
    return { title, author } as Track
}

describe('AutoplayAuditCollector', () => {
    let collector: AutoplayAuditCollector

    beforeEach(() => {
        collector = new AutoplayAuditCollector()
    })

    describe('recordEvaluated', () => {
        it('records an accepted candidate', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const track = makeTrack('Song A', 'Artist A')

            collector.recordEvaluated(track, 0.85, 'spotify rec', 'accepted')
            collector.emit('g1', 'seed-1', null, {}, 100)

            const record = infoLog.mock.calls[0][0].data
            expect(record.evaluated).toHaveLength(1)
            expect(record.evaluated[0]).toMatchObject({
                title: 'Song A',
                artist: 'Artist A',
                score: 0.85,
                reason: 'spotify rec',
                status: 'accepted',
            })
        })

        it('records a rejected candidate', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const track = makeTrack('Song B', 'Artist B')

            collector.recordEvaluated(track, 0.2, 'disliked', 'rejected')
            collector.emit('g1', 'seed-1', null, {}, 50)

            const record = infoLog.mock.calls[0][0].data
            expect(record.evaluated[0].status).toBe('rejected')
        })

        it('accumulates multiple evaluated candidates', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }

            collector.recordEvaluated(makeTrack('A', 'Artist1'), 0.9, 'r1', 'accepted')
            collector.recordEvaluated(makeTrack('B', 'Artist2'), 0.4, 'r2', 'rejected')
            collector.recordEvaluated(makeTrack('C', 'Artist3'), 0.7, 'r3', 'accepted')
            collector.emit('g1', 'seed', null, {}, 200)

            const record = infoLog.mock.calls[0][0].data
            expect(record.evaluated).toHaveLength(3)
        })
    })

    describe('setFinalSelected', () => {
        it('maps scored tracks to selected entries', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const scoredTracks = [
                { track: makeTrack('Song X', 'ArtistX'), score: 0.95, reason: 'top pick' },
                { track: makeTrack('Song Y', 'ArtistY'), score: 0.8, reason: 'secondary' },
            ]

            collector.setFinalSelected(scoredTracks)
            collector.emit('g1', 'seed', null, {}, 150)

            const record = infoLog.mock.calls[0][0].data
            expect(record.selected).toHaveLength(2)
            expect(record.selected[0]).toMatchObject({
                title: 'Song X',
                artist: 'ArtistX',
                score: 0.95,
                reason: 'top pick',
            })
        })

        it('defaults to empty selected when not called', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }

            collector.emit('g1', 'seed', null, {}, 50)

            expect(infoLog.mock.calls[0][0].data.selected).toHaveLength(0)
        })
    })

    describe('emit', () => {
        it('logs an audit record with correct structure', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const sourceCounts = { spotify: 3, lastfm: 2 }

            collector.emit('guild-42', 'Artist - Track', null, sourceCounts, 300)

            expect(infoLog).toHaveBeenCalledTimes(1)
            const call = infoLog.mock.calls[0][0]
            expect(call.message).toBe('Autoplay audit')
            const record = call.data
            expect(record.guildId).toBe('guild-42')
            expect(record.seed).toBe('Artist - Track')
            expect(record.sourceCounts).toEqual(sourceCounts)
            expect(record.durationMs).toBe(300)
            expect(typeof record.cycleId).toBe('string')
            expect(typeof record.timestamp).toBe('number')
        })

        it('sets sessionMoodSummary to null when mood is null', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }

            collector.emit('g1', 'seed', null, {}, 0)

            expect(infoLog.mock.calls[0][0].data.sessionMoodSummary).toBeNull()
        })

        it('sets sessionMoodSummary from mood dominantLocale', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const mood = { dominantLocale: 'spanish' as const } as import('./sessionMood').SessionMood

            collector.emit('g1', 'seed', mood, {}, 0)

            expect(infoLog.mock.calls[0][0].data.sessionMoodSummary).toBe('spanish')
        })

        it('sets sessionMoodSummary to null when dominantLocale is null', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }
            const mood = { dominantLocale: null } as import('./sessionMood').SessionMood

            collector.emit('g1', 'seed', mood, {}, 0)

            expect(infoLog.mock.calls[0][0].data.sessionMoodSummary).toBeNull()
        })

        it('includes cycleId containing the guildId', () => {
            const { infoLog } = require('@lucky/shared/utils') as { infoLog: jest.Mock }

            collector.emit('my-guild', 'seed', null, {}, 0)

            expect(infoLog.mock.calls[0][0].data.cycleId).toContain('my-guild')
        })
    })
})
