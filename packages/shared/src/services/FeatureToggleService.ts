import type {
    FeatureToggleName,
    GlobalFeatureToggleProvider,
    GlobalFeatureToggleState,
} from '../types/featureToggle'
import { getFeatureToggleConfig } from '../config/featureToggles'
import { getPrismaClient } from '../utils/database/prismaClient'

/** Manages feature toggles with multi-layer provider support (database, environment). */
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

    private async getDbGlobalOverride(name: string): Promise<boolean | null> {
        try {
            const row = await this.db.globalFeatureToggle.findUnique({
                where: { name },
                select: { enabled: true },
            })
            return row?.enabled ?? null
        } catch {
            return null
        }
    }

    /** Sets a global feature toggle override in the database. */
    async setGlobalFeatureToggle(
        name: FeatureToggleName,
        enabled: boolean,
    ): Promise<void> {
        await this.db.globalFeatureToggle.upsert({
            where: { name },
            update: { enabled },
            create: { name, enabled },
        })
    }

    /** Gets the current toggle provider (database). */
    getGlobalToggleProvider(): GlobalFeatureToggleProvider {
        return 'database'
    }

    /** Gets the global toggle status with provider information. */
    async getGlobalToggleStatus(
        name: FeatureToggleName,
    ): Promise<GlobalFeatureToggleState> {
        const fallbackValue = this.getFallbackValue(name)

        const dbOverride = await this.getDbGlobalOverride(name)
        if (dbOverride !== null) {
            return {
                enabled: dbOverride,
                provider: 'database',
                writable: true,
            }
        }

        return {
            enabled: fallbackValue,
            provider: 'environment',
            writable: true,
        }
    }

    /** Checks if a feature is globally enabled. */
    async isEnabledGlobal(name: FeatureToggleName): Promise<boolean> {
        const status = await this.getGlobalToggleStatus(name)
        return status.enabled
    }

    /** Checks if a feature is enabled (optionally scoped to user/guild). */
    async isEnabled(
        name: FeatureToggleName,
        _context?: { userId?: string; guildId?: string },
    ): Promise<boolean> {
        return this.isEnabledGlobal(name)
    }

    /** Returns a copy of all loaded fallback toggles. */
    getAllToggles(): Map<FeatureToggleName, boolean> {
        return new Map(this.fallbackToggles)
    }

    /** Gets a toggle value from the fallback configuration. */
    getToggle(name: FeatureToggleName): boolean {
        return this.getFallbackValue(name)
    }
}

/** Singleton instance of FeatureToggleService. */
export const featureToggleService = new FeatureToggleService()
