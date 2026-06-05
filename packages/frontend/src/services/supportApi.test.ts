import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createSupportApi } from './supportApi'

function makeClient(get: ReturnType<typeof vi.fn>): AxiosInstance {
    return { get } as unknown as AxiosInstance
}

const realFetch = globalThis.fetch

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    globalThis.fetch = realFetch
})

describe('createSupportApi.submit', () => {
    test('POSTs multipart to <base>/support and returns the id', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({ id: 'r1' }) })
        globalThis.fetch = fetchMock as unknown as typeof fetch
        const sapi = createSupportApi(makeClient(vi.fn()), '/api')

        const fd = new FormData()
        fd.append('context', 'x')
        const res = await sapi.submit(fd)

        expect(res).toEqual({ id: 'r1' })
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/api/support')
        expect(init.method).toBe('POST')
        expect(init.credentials).toBe('include')
        expect(init.body).toBe(fd)
    })

    test('throws the server error message on a non-ok JSON response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'too large' }),
        }) as unknown as typeof fetch
        const sapi = createSupportApi(makeClient(vi.fn()), '/api')
        await expect(sapi.submit(new FormData())).rejects.toThrow('too large')
    })

    test('falls back to a generic message when the error body is not JSON', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => {
                throw new Error('not json')
            },
        }) as unknown as typeof fetch
        const sapi = createSupportApi(makeClient(vi.fn()), '/api')
        await expect(sapi.submit(new FormData())).rejects.toThrow(
            /Failed to submit/i,
        )
    })
})

describe('createSupportApi admin reads', () => {
    test('listAdmin GETs /admin/support with params', async () => {
        const get = vi.fn().mockResolvedValue({ data: [{ id: 'r1' }] })
        const sapi = createSupportApi(makeClient(get), '/api')
        const out = await sapi.listAdmin({ status: 'new', take: 5 })
        expect(out).toEqual([{ id: 'r1' }])
        expect(get).toHaveBeenCalledWith('/admin/support', {
            params: { status: 'new', take: 5 },
        })
    })

    test('getAdmin GETs /admin/support/:id', async () => {
        const get = vi.fn().mockResolvedValue({ data: { id: 'r1' } })
        const sapi = createSupportApi(makeClient(get), '/api')
        const out = await sapi.getAdmin('r1')
        expect(out).toEqual({ id: 'r1' })
        expect(get).toHaveBeenCalledWith('/admin/support/r1')
    })

    test('imageUrl builds the credentialed image endpoint', () => {
        const sapi = createSupportApi(makeClient(vi.fn()), '/api')
        expect(sapi.imageUrl('r1')).toBe('/api/admin/support/r1/image')
    })
})
