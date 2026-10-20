import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { setupErrorHandlers } from './errorEventHandlers'
import { closePlayStartWatch, openPlayStartWatch } from './playStartWatch'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
    infoLog: jest.fn(),
    captureException: jest.fn(),
    sanitizeErrorMessage: (message: string) => message,
    sanitizeStack: (stack: string) => stack,
}))

jest.mock('@lucky/shared/config', () => ({
    youtubeConfig: { errorHandling: {} },
}))

jest.mock('../../services/musicManagement/search/providerHealth', () => ({
    providerFromTrack: () => 'youtube',
    providerHealthService: {
        recordFailure: jest.fn(),
        recordSuccess: jest.fn(),
    },
}))

jest.mock('../../services/musicManagement/youtubeErrorHandler', () => ({
    analyzeYouTubeError: () => ({ isParserError: false }),
    logYouTubeError: jest.fn(),
}))

jest.mock('./ytdlpBlockBreaker', () => ({
    classifyYtDlpFailure: () => 'other',
}))

jest.mock('./autoplayOutcomeTracking', () => ({
    isAutoplayTrack: () => false,
}))

jest.mock('../../services/musicManagement/replenishSuppressionStore', () => ({
    setReplenishSuppressed: jest.fn(),
}))

jest.mock('./streamFailureNotifier', () => ({
    notifyChannelStreamFailed: jest.fn(async () => undefined),
    notifyChannelAutoplayStopped: jest.fn(async () => undefined),
}))

jest.mock(
    '../../functions/music/commands/play/handlers/resolveProvider',
    () => ({ TEXT_SEARCH_BLOCKED_EXTRACTORS: [] }),
)

type FakeTrack = { title: string; url: string; requestedBy: { id: string } }

const user = { id: 'user-1' }
const track = (title: string): FakeTrack => ({
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    requestedBy: user,
})

/**
 * Models the parts of discord-player 7.2 GuildQueue a stream failure touches.
 * `#throw` emits playerError and then dispatches the next queued track itself
 * (GuildQueuePlayerNode, dist/index.js `throw_fn`); with nothing queued it
 * finishes the queue, which leaves no current track. `skip()` ends whatever
 * is current and the queue moves on, as the dispatcher "finish" handler does.
 */
function createQueue(failing: Set<FakeTrack>) {
    const handlers = new Map<string, Function>()
    const queue = {
        guild: { id: 'guild-1', name: 'Guild 1' },
        metadata: {},
        tracks: [] as FakeTrack[],
        currentTrack: null as FakeTrack | null,
        started: [] as FakeTrack[],
        endedBySkip: [] as FakeTrack[],
        player: {
            search: jest.fn<() => Promise<{ tracks: FakeTrack[] }>>(),
            client: { user: { id: 'bot-1' } },
        },
        insertTrack(t: FakeTrack, index: number) {
            queue.tracks.splice(index, 0, t)
        },
        isPlaying() {
            return queue.currentTrack !== null
        },
        node: {
            skip() {
                const current = queue.currentTrack
                if (!current) return false
                queue.endedBySkip.push(current)
                queue.currentTrack = null
                const next = queue.tracks.shift()
                if (next) void queue.node.play(next)
                return true
            },
            async play(res?: FakeTrack) {
                const next = res ?? queue.tracks.shift()
                if (!next) return
                queue.currentTrack = next
                if (!failing.has(next)) {
                    queue.started.push(next)
                    return
                }
                handlers.get('playerError')?.(
                    queue,
                    new Error(
                        'Could not extract stream for this track\n\nBridge exhausted',
                    ),
                    next,
                )
                const after = queue.tracks.shift()
                if (after) return void queue.node.play(after)
                queue.currentTrack = null
            },
        },
    }
    setupErrorHandlers({
        events: {
            on: (event: string, handler: Function) =>
                handlers.set(event, handler),
        },
    })
    return queue
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve))
    }
}

describe('stream failure on a user track', () => {
    const failed = track('Song A')
    const queued = track('Song B')
    const alternative = track('Another Upload')

    beforeEach(() => {
        delete process.env.HOSTED_YOUTUBE_ENABLED
    })

    it('keeps the queued track discord-player already started when recovery finds a replacement', async () => {
        const queue = createQueue(new Set([failed]))
        queue.player.search.mockResolvedValue({ tracks: [alternative] })
        queue.tracks.push(failed, queued)

        await queue.node.play()
        await settle()

        expect(queue.endedBySkip).toEqual([])
        expect(queue.currentTrack).toBe(queued)
        expect(queue.tracks[0]).toBe(alternative)
    })

    it('keeps the queued track playing when recovery gives up', async () => {
        const queue = createQueue(new Set([failed]))
        queue.player.search.mockResolvedValue({ tracks: [] })
        queue.tracks.push(failed, queued)

        await queue.node.play()
        await settle()

        expect(queue.endedBySkip).toEqual([])
        expect(queue.currentTrack).toBe(queued)
    })

    it('starts the replacement when the failed track was the last one and tells /play it recovered', async () => {
        const queue = createQueue(new Set([failed]))
        queue.player.search.mockResolvedValue({ tracks: [alternative] })
        queue.tracks.push(failed)
        const watch = openPlayStartWatch('guild-1', failed as never)
        const outcome = jest.fn()
        void watch.settled.then(outcome)

        await queue.node.play()
        await settle()
        closePlayStartWatch(watch)

        expect(queue.started).toEqual([alternative])
        expect(queue.currentTrack).toBe(alternative)
        expect(outcome).toHaveBeenCalledWith('recovered')
    })
})
