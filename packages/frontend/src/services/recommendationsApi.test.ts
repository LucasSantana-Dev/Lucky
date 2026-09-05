import { describe, test, expect, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { createRecommendationsApi } from './recommendationsApi'

describe('createRecommendationsApi', () => {
    test('getHistory calls the history endpoint without params by default', async () => {
        const data = {
            summary: {
                totalPicks: 0,
                accepted: 0,
                rejected: 0,
                pending: 0,
                globalAcceptanceRate: null,
            },
            perSource: [],
        }
        const get = vi.fn().mockResolvedValue({ data })
        const client = { get } as unknown as AxiosInstance
        const api = createRecommendationsApi(client)

        const res = await api.getHistory('g1')

        expect(res.data).toEqual(data)
        expect(get).toHaveBeenCalledWith(
            '/guilds/g1/recommendations/history',
            undefined,
        )
    })

    test('getHistory forwards the days param when provided', async () => {
        const get = vi.fn().mockResolvedValue({ data: {} })
        const client = { get } as unknown as AxiosInstance
        const api = createRecommendationsApi(client)

        await api.getHistory('g1', 30)

        expect(get).toHaveBeenCalledWith('/guilds/g1/recommendations/history', {
            params: { days: 30 },
        })
    })

    test('getHistory propagates rejections', async () => {
        const get = vi.fn().mockRejectedValue(new Error('network error'))
        const client = { get } as unknown as AxiosInstance
        const api = createRecommendationsApi(client)

        await expect(api.getHistory('g1')).rejects.toThrow('network error')
    })
})
