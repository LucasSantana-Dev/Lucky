import {
    getVercelFlagsClient,
    isVercelFlagsConfigured,
} from '../config/vercelFlags'
import type {
    FeatureToggleName,
    GlobalFeatureToggleProvider,
    GlobalFeatureToggleState,
} from '../types/featureToggle'
import { getFeatureToggleConfig } from '../config/featureToggles'
import { debugLog } from '../utils/general/log'
import { getPrismaClient } from '../utils/database/prismaClient'

class FeatureToggleService {
    private fallbackToggles: Map<FeatureToggleName, boolean> = new Map()

    constructor() {
        this.loadFallbackToggles()
    }

    private loadFallbackToggles(): void {
        const config = getFeatureToggleConfig()
        for (const [name, toggleConfig] of Object.entries(config)) {
            this.fallbackToggles.set(
                name as FeatureToggleName,
                toggleConfig.enabled,
            )
        }
    }

    private getFallbackValue(name: FeatureToggleName): boolean {
        return this.fallbackToggles.get(name) ?? true
    }

    private get db() {
        return getPrismaClient()
    }

    private async getDbOverride(
        guildId: string,
        name: string,
    ): Promise<boolean | null> {
        try {
            const row = await this.db.guildFeatureToggle.findUnique({
                where: { guildId_name: { guildId, name } },
                select: { enabled: true },
            })
            return row?.enabled ?? null
        } catch {
            return null
        }
    }

    async setGuildFeatureToggle(
        guildId: string,
        name: FeatureToggleName,
        enabled: boolean,
    ): Promise<void> {
        await this.db.guildFeatureToggle.upsert({
            where: { guildId_name: { guildId, name } },
            update: { enabled },
            create: { guildId, name, enabled },
        })
    }

    private async getVercelValue(
        name: FeatureToggleName,
        fallbackValue: boolean,
    ): Promise<boolean | null> {
        const client = getVercelFlagsClient()

        if (client === null) {
            return null
        }

        try {
            const result = await client.evaluate<boolean>(name, fallbackValue)
            if (result.reason === 'error') {
                debugLog({
                    message: `Vercel flag ${name} unavailable, using fallback`,
                    error: result.errorMessage,
                })
                return null
            }
            if (typeof result.value !== 'boolean') {
                debugLog({
                    message: `Vercel flag ${name} returned a non-boolean value`,
                })
                return null
            }
            return result.value
        } catch (error) {
            debugLog({
                message: `Error checking Vercel flag ${name}, using fallback`,
                error,
            })
            return null
        }
    }

    getGlobalToggleProvider(): GlobalFeatureToggleProvider {
        return isVercelFlagsConfigured() ? 'vercel' : 'environment'
    }

    async getGlobalToggleStatus(
        name: FeatureToggleName,
    ): Promise<GlobalFeatureToggleState> {
        const fallbackValue = this.getFallbackValue(name)
        const vercelValue = await this.getVercelValue(name, fallbackValue)

        if (vercelValue !== null) {
            return {
                enabled: vercelValue,
                provider: 'vercel',
                writable: false,
            }
        }

        return {
            enabled: fallbackValue,
            provider: 'environment',
            writable: false,
        }
    }

    async isEnabledGlobal(name: FeatureToggleName): Promise<boolean> {
        const status = await this.getGlobalToggleStatus(name)
        return status.enabled
    }

    async isEnabledForGuild(
        name: FeatureToggleName,
        guildId: string,
    ): Promise<boolean> {
        const dbOverride = await this.getDbOverride(guildId, name)

        if (dbOverride !== null) {
            return dbOverride
        }

        return this.isEnabledGlobal(name)
    }

    async isEnabled(
        name: FeatureToggleName,
        context?: { userId?: string; guildId?: string },
    ): Promise<boolean> {
        if (context?.guildId) {
            return this.isEnabledForGuild(name, context.guildId)
        }

        return this.isEnabledGlobal(name)
    }

    getAllToggles(): Map<FeatureToggleName, boolean> {
        return new Map(this.fallbackToggles)
    }

    getToggle(name: FeatureToggleName): boolean {
        return this.getFallbackValue(name)
    }
}

export const featureToggleService = new FeatureToggleService()
