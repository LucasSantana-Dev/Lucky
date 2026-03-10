import { describe, expect, jest, test } from '@jest/globals'
import type { Redis } from 'ioredis'
import { createConnectRedisClientAdapter } from '../../../src/middleware/session'

function createRedisMock() {
    const set = jest.fn().mockResolvedValue('OK')
    const del = jest.fn().mockResolvedValue(1)
    const mget = jest.fn().mockResolvedValue(['value'])
    const scan = jest
        .fn()
        .mockResolvedValueOnce(['1', ['k1', 'k2']])
        .mockResolvedValueOnce(['0', ['k3']])
    const get = jest.fn().mockResolvedValue('value')
    const expire = jest.fn().mockResolvedValue(1)

    const client = {
        set,
        del,
        mget,
        scan,
        get,
        expire,
    } as unknown as Redis

    return { client, set, del, mget, scan, get, expire }
}

describe('Redis session adapter', () => {
    test('maps EX expiration in set()', async () => {
        const { client, set } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await adapter.set('session-key', 'value', {
            expiration: { type: 'EX', value: 120 },
        })

        expect(set).toHaveBeenCalledWith('session-key', 'value', 'EX', 120)
    })

    test('flattens key array in del()', async () => {
        const { client, del } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await adapter.del(['sess:1', 'sess:2'])

        expect(del).toHaveBeenCalledWith('sess:1', 'sess:2')
    })

    test('maps PX expiration in set()', async () => {
        const { client, set } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await adapter.set('session-key', 'value', {
            expiration: { type: 'PX', value: 5000 },
        })

        expect(set).toHaveBeenCalledWith('session-key', 'value', 'PX', 5000)
    })

    test('uses plain set() without expiration options', async () => {
        const { client, set } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await adapter.set('session-key', 'value')

        expect(set).toHaveBeenCalledWith('session-key', 'value')
    })

    test('forwards arrays in mGet()', async () => {
        const { client, mget } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await adapter.mGet(['sess:1', 'sess:2'])

        expect(mget).toHaveBeenCalledWith('sess:1', 'sess:2')
    })

    test('implements scanIterator with MATCH and COUNT', async () => {
        const { client, scan } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)
        const keys: string[][] = []

        for await (const chunk of adapter.scanIterator({
            MATCH: 'lucky:sess:*',
            COUNT: 100,
        })) {
            keys.push(chunk)
        }

        expect(keys).toEqual([['k1', 'k2'], ['k3']])
        expect(scan).toHaveBeenNthCalledWith(
            1,
            '0',
            'MATCH',
            'lucky:sess:*',
            'COUNT',
            '100',
        )
        expect(scan).toHaveBeenNthCalledWith(
            2,
            '1',
            'MATCH',
            'lucky:sess:*',
            'COUNT',
            '100',
        )
    })

    test('returns defaults for empty key lists', async () => {
        const { client, del, mget } = createRedisMock()
        const adapter = createConnectRedisClientAdapter(client)

        await expect(adapter.del([])).resolves.toBe(0)
        await expect(adapter.mGet([])).resolves.toEqual([])

        expect(del).not.toHaveBeenCalled()
        expect(mget).not.toHaveBeenCalled()
    })
})
