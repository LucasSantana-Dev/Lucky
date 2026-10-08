import { describe, expect, it } from '@jest/globals'
import { EventEmitter } from 'node:events'
import { watchStreamStartFailures } from './streamStartWatcher'

const queueOf = (guildId: string) => ({ guild: { id: guildId } })
const trackOf = (id: string) => ({ id, title: id }) as never

function makePlayer() {
    const events = new EventEmitter()
    return { player: { events } as never, events }
}

describe('watchStreamStartFailures', () => {
    it('flags a track skipped for having no stream', () => {
        const { player, events } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')
        const track = trackOf('t1')

        events.emit('playerSkip', queueOf('g1'), track, 'ERR_NO_STREAM', 'x')

        expect(watcher.hasFailed(track)).toBe(true)
    })

    it('flags a track that raised playerError', () => {
        const { player, events } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')
        const track = trackOf('t1')

        events.emit('playerError', queueOf('g1'), new Error('x'), track)

        expect(watcher.hasFailed(track)).toBe(true)
    })

    it('matches by track id when the instance differs', () => {
        const { player, events } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')

        events.emit('playerError', queueOf('g1'), new Error('x'), trackOf('t1'))

        expect(watcher.hasFailed(trackOf('t1'))).toBe(true)
        expect(watcher.hasFailed(trackOf('t2'))).toBe(false)
    })

    it('ignores another guild and a manual skip', () => {
        const { player, events } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')
        const track = trackOf('t1')

        events.emit('playerError', queueOf('g2'), new Error('x'), track)
        events.emit('playerSkip', queueOf('g1'), track, 'MANUAL', 'x')

        expect(watcher.hasFailed(track)).toBe(false)
    })

    it('does not flag a missing track', () => {
        const { player } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')

        expect(watcher.hasFailed(undefined)).toBe(false)
    })

    it('detaches both listeners on dispose, twice safely', () => {
        const { player, events } = makePlayer()
        const watcher = watchStreamStartFailures(player, 'g1')
        expect(events.listenerCount('playerSkip')).toBe(1)
        expect(events.listenerCount('playerError')).toBe(1)

        watcher.dispose()
        watcher.dispose()

        expect(events.listenerCount('playerSkip')).toBe(0)
        expect(events.listenerCount('playerError')).toBe(0)
    })
})
