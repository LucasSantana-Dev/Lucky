import { describe, expect, test, vi } from 'vitest'
import { createAutomationApi } from './automationApi'

describe('automationApi.getStatus', () => {
    test('returns status string as-is', async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                status: 'running',
                runs: [{ id: '1', status: 'running' }],
            },
        })

        const api = createAutomationApi({ get } as any)
        const result = await api.getStatus('guild-1')

        expect(get).toHaveBeenCalledWith('/guilds/guild-1/automation/status')
        expect(result.status).toBe('running')
        expect(result.runs).toHaveLength(1)
    })

    test('normalizes object status to latest run status', async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                status: {
                    manifest: { guildId: 'guild-1', version: '1' },
                    latestRun: { id: 'run-1', status: 'applied' },
                    drifts: [],
                },
                runs: [{ id: 'run-1', status: 'applied' }],
            },
        })

        const api = createAutomationApi({ get } as any)
        const result = await api.getStatus('guild-1')

        expect(result.status).toBe('applied')
    })

    test('falls back to configured when only manifest exists', async () => {
        const get = vi.fn().mockResolvedValue({
            data: {
                status: {
                    manifest: { guildId: 'guild-1', version: '1' },
                    latestRun: null,
                    drifts: [],
                },
                runs: undefined,
            },
        })

        const api = createAutomationApi({ get } as any)
        const result = await api.getStatus('guild-1')

        expect(result.status).toBe('configured')
        expect(result.runs).toEqual([])
    })
})
