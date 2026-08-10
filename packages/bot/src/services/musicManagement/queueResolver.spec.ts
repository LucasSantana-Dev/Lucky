import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { resolveGuildQueue } from './queueResolver'

const debugLogMock = jest.fn()
const warnLogMock = jest.fn()
const addBreadcrumbMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('@lucky/shared/utils/monitoring', () => ({
    addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}))

type QueueLike = {
    id?: string
    guild?: { id?: string }
    metadata?: {
        channel?: {
            guildId?: string
            guild?: { id?: string }
        }
    }
}

function createQueue(id: string, guildId = id): QueueLike {
    return {
        id,
        guild: { id: guildId },
    }
}

function createClient({
    nodesGet,
    queuesGet,
    nodesResolve,
    cacheMap,
    cacheValues,
}: {
    nodesGet?: QueueLike | null
    queuesGet?: QueueLike | null
    nodesResolve?: QueueLike | null
    cacheMap?: Map<string, QueueLike>
    cacheValues?: QueueLike[]
} = {}) {
    const map = cacheMap ?? new Map<string, QueueLike>()
    let generatedKeyIndex = 0

    if (cacheValues) {
        for (const queue of cacheValues) {
            map.set(queue.id ?? `generated-${generatedKeyIndex++}`, queue)
        }
    }

    return {
        player: {
            nodes: {
                get: jest.fn(() => nodesGet ?? null),
                resolve: jest.fn(() => nodesResolve ?? null),
                cache: {
                    size: map.size,
                    get: jest.fn((key: string) => map.get(key)),
                    keys: jest.fn(() => map.keys()),
                    values: jest.fn(() => map.values()),
                },
            },
            queues: {
                get: jest.fn(() => queuesGet ?? null),
            },
        },
    } as any
}

describe('queueResolver', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('resolves from nodes.get first', () => {
        const queue = createQueue('guild-1')
        const client = createClient({ nodesGet: queue })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('nodes.get')
        expect(debugLogMock).toHaveBeenCalled()
        expect(warnLogMock).not.toHaveBeenCalled()
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'nodes.get',
            }),
        )
    })

    it('falls back to queues.get when nodes.get misses', () => {
        const queue = createQueue('guild-1')
        const client = createClient({ queuesGet: queue })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('queues.get')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'queues.get',
            }),
        )
    })

    it('falls back to nodes.resolve when direct getters miss', () => {
        const queue = createQueue('guild-1')
        const client = createClient({ nodesResolve: queue })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('nodes.resolve')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'nodes.resolve',
            }),
        )
    })

    it('falls back to nodes.cache.get by guild key', () => {
        const queue = createQueue('guild-1')
        const cacheMap = new Map<string, QueueLike>([['guild-1', queue]])
        const client = createClient({ cacheMap })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('nodes.cache.get')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'nodes.cache.get',
            }),
        )
    })

    it('falls back to cache scan by queue id', () => {
        const queue = createQueue('queue-id', 'guild-x')
        const cacheMap = new Map<string, QueueLike>([['different-key', queue]])
        const client = createClient({ cacheMap })

        const result = resolveGuildQueue(client, 'queue-id')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('cache.id')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'cache.id',
            }),
        )
    })

    it('falls back to cache scan by queue.guild.id (guild is authoritative before queue.id)', () => {
        const queue = createQueue('queue-id', 'guild-1')
        const cacheMap = new Map<string, QueueLike>([['different-key', queue]])
        const client = createClient({ cacheMap })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('cache.guild')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'cache.guild',
            }),
        )
    })

    it('prefers cache.guild over cache.id when both match', () => {
        const queue = createQueue('same-id', 'same-id')
        const cacheMap = new Map<string, QueueLike>([['different-key', queue]])
        const client = createClient({ cacheMap })

        // Request by the guild ID (which is same as queue id)
        const result = resolveGuildQueue(client, 'same-id')

        expect(result.queue).toBe(queue)
        // Should resolve via guild first (authoritative)
        expect(result.source).toBe('cache.guild')
    })

    it('falls back to cache scan by metadata.channel.guildId', () => {
        const queue: QueueLike = {
            id: 'queue-id',
            metadata: {
                channel: {
                    guildId: 'guild-1',
                },
            },
        }
        const cacheMap = new Map<string, QueueLike>([['different-key', queue]])
        const client = createClient({ cacheMap })

        const result = resolveGuildQueue(client, 'guild-1')

        expect(result.queue).toBe(queue)
        expect(result.source).toBe('cache.guild')
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'cache.guild',
            }),
        )
    })

    it('returns miss with diagnostics and telemetry when queue cannot be resolved', () => {
        const cacheMap = new Map<string, QueueLike>([
            ['guild-a', createQueue('guild-a')],
            ['guild-b', createQueue('guild-b')],
        ])
        const client = createClient({ cacheMap })

        const result = resolveGuildQueue(client, 'guild-z')

        expect(result.queue).toBeNull()
        expect(result.source).toBe('miss')
        expect(result.diagnostics).toEqual(
            expect.objectContaining({
                guildId: 'guild-z',
                cacheSize: 2,
                cacheSampleKeys: ['guild-a', 'guild-b'],
            }),
        )
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Unable to resolve guild queue',
            }),
        )
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'miss',
            }),
        )
    })

    it('logs debug on miss when queue cache is empty', () => {
        const client = createClient({
            cacheMap: new Map<string, QueueLike>(),
        })

        const result = resolveGuildQueue(client, 'guild-z')

        expect(result.queue).toBeNull()
        expect(result.source).toBe('miss')
        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Unable to resolve guild queue',
            }),
        )
        expect(warnLogMock).not.toHaveBeenCalled()
        expect(addBreadcrumbMock).toHaveBeenCalledWith(
            'queue_resolution_source',
            'queue_resolution',
            'info',
            expect.objectContaining({
                source: 'miss',
            }),
        )
    })
})
