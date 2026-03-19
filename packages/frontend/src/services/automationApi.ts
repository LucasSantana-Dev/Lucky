import type { AxiosInstance } from 'axios'

export interface GuildAutomationManifest {
    guildId: string
    version: string
    roles?: Record<string, unknown>
    channels?: Record<string, unknown>
    settings?: Record<string, unknown>
    [key: string]: unknown
}

export interface AutomationRun {
    id: string
    guildId: string
    type: string
    status: string
    summary?: string
    error?: string
    createdAt: string
    completedAt?: string
}

export interface AutomationStatus {
    status: string
    runs: AutomationRun[]
}

type RawAutomationStatus =
    | string
    | {
          manifest?: unknown
          latestRun?: { status?: unknown } | null
      }

function normalizeAutomationStatus(rawStatus: RawAutomationStatus): string {
    if (typeof rawStatus === 'string') {
        return rawStatus
    }

    if (rawStatus && typeof rawStatus === 'object') {
        if (typeof rawStatus.latestRun?.status === 'string') {
            return rawStatus.latestRun.status
        }

        if ('manifest' in rawStatus && rawStatus.manifest) {
            return 'configured'
        }
    }

    return 'unknown'
}

export interface PlanResult {
    changes: Array<{
        type: string
        resource: string
        action: string
        details?: Record<string, unknown>
    }>
    summary: string
}

export interface ApplyResult {
    applied: number
    failed: number
    summary: string
    changes: Array<{
        type: string
        resource: string
        action: string
        status: string
        error?: string
    }>
}

export function createAutomationApi(client: AxiosInstance) {
    return {
        getManifest: async (guildId: string): Promise<GuildAutomationManifest | null> => {
            try {
                const res = await client.get<GuildAutomationManifest>(
                    `/guilds/${guildId}/automation/manifest`,
                )
                return res.data
            } catch (err: unknown) {
                const e = err as { response?: { status?: number } }
                if (e?.response?.status === 404) return null
                throw err
            }
        },
        updateManifest: async (
            guildId: string,
            manifest: GuildAutomationManifest,
        ): Promise<{ guildId: string; version: string; updatedAt: string }> => {
            const res = await client.put<{ guildId: string; version: string; updatedAt: string }>(
                `/guilds/${guildId}/automation/manifest`,
                manifest,
            )
            return res.data
        },
        capture: async (guildId: string, manifest: GuildAutomationManifest): Promise<void> => {
            await client.post(`/guilds/${guildId}/automation/capture`, manifest)
        },
        plan: async (
            guildId: string,
            options?: { actualState?: unknown; allowProtected?: boolean },
        ): Promise<PlanResult> => {
            const res = await client.post<PlanResult>(
                `/guilds/${guildId}/automation/plan`,
                options ?? {},
            )
            return res.data
        },
        apply: async (
            guildId: string,
            options?: { actualState?: unknown; allowProtected?: boolean },
        ): Promise<ApplyResult> => {
            const res = await client.post<ApplyResult>(
                `/guilds/${guildId}/automation/apply`,
                options ?? {},
            )
            return res.data
        },
        reconcile: async (
            guildId: string,
            options?: { actualState?: unknown; allowProtected?: boolean },
        ): Promise<ApplyResult> => {
            const res = await client.post<ApplyResult>(
                `/guilds/${guildId}/automation/reconcile`,
                options ?? {},
            )
            return res.data
        },
        getStatus: async (guildId: string): Promise<AutomationStatus> => {
            const res = await client.get<{ status: RawAutomationStatus; runs?: AutomationRun[] }>(
                `/guilds/${guildId}/automation/status`,
            )
            return {
                status: normalizeAutomationStatus(res.data.status),
                runs: Array.isArray(res.data.runs) ? res.data.runs : [],
            }
        },
        cutover: async (
            guildId: string,
            options?: { completeChecklist?: boolean },
        ): Promise<unknown> => {
            const res = await client.post(
                `/guilds/${guildId}/automation/cutover`,
                options ?? {},
            )
            return res.data
        },
        applyPreset: async (guildId: string, preset: string): Promise<unknown> => {
            const res = await client.post(
                `/guilds/${guildId}/automation/presets/${preset}/apply`,
            )
            return res.data
        },
    }
}
