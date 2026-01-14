import { unleash, isUnleashEnabled } from '../config/unleash'
import type { FeatureToggleName } from '../types/featureToggle'
import { getFeatureToggleConfig } from '../config/featureToggles'
import { debugLog } from '../utils/general/log'

const DEVELOPER_USER_IDS = (process.env.DEVELOPER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

class FeatureToggleService {
    private fallbackToggles: Map<FeatureToggleName, boolean> = new Map()
    private unleashReady: boolean = false

    constructor() {
        this.loadFallbackToggles()
        this.initializeUnleash()
    }

    private loadFallbackToggles(): void {
        const config = getFeatureToggleConfig()
        for (const [name, toggleConfig] of Object.entries(config)) {
            this.fallbackToggles.set(name as FeatureToggleName, toggleConfig.enabled)
        }
    }

    private initializeUnleash(): void {
        if (!isUnleashEnabled() || unleash === null) {
            debugLog({ message: 'Unleash disabled, using fallback toggles' })
            this.unleashReady = true
            return
        }

        unleash.on('ready', () => {
            this.unleashReady = true
            debugLog({ message: 'Unleash ready for feature toggle checks' })
        })
    }

    private getFallbackValue(name: FeatureToggleName): boolean {
        return this.fallbackToggles.get(name) ?? true
    }

    private isDeveloper(userId?: string): boolean {
        if (!userId) return false
        return DEVELOPER_USER_IDS.includes(userId)
    }

    async isEnabledGlobal(
        name: FeatureToggleName,
        userId?: string,
    ): Promise<boolean> {
        if (!this.isDeveloper(userId)) {
            debugLog({
                message: `Non-developer attempted to check global toggle ${name}`,
            })
            return false
        }

        if (!isUnleashEnabled() || !this.unleashReady || unleash === null) {
            return this.getFallbackValue(name)
        }

        try {
            const unleashContext = userId
                ? {
                      userId,
                      properties: {},
                  }
                : undefined

            const enabled = unleash.isEnabled(name, unleashContext)
            return enabled || this.getFallbackValue(name)
        } catch (error) {
            debugLog({
                message: `Error checking global toggle ${name}, using fallback:`,
                error,
            })
            return this.getFallbackValue(name)
        }
    }

    async isEnabledForGuild(
        name: FeatureToggleName,
        guildId: string,
        userId?: string,
    ): Promise<boolean> {
        if (!isUnleashEnabled() || !this.unleashReady || unleash === null) {
            return this.getFallbackValue(name)
        }

        try {
            const globalEnabled = await this.isEnabled(name, {
                userId,
                guildId: undefined,
            })

            const unleashContext = {
                userId,
                properties: {
                    guildId,
                },
            }

            const perServerEnabled = unleash.isEnabled(name, unleashContext)

            return perServerEnabled || globalEnabled
        } catch (error) {
            debugLog({
                message: `Error checking per-server toggle ${name} for guild ${guildId}, using fallback:`,
                error,
            })
            return this.getFallbackValue(name)
        }
    }

    async isEnabled(
        name: FeatureToggleName,
        context?: { userId?: string; guildId?: string },
    ): Promise<boolean> {
        if (context?.guildId) {
            return this.isEnabledForGuild(name, context.guildId, context.userId)
        }

        if (!isUnleashEnabled() || !this.unleashReady || unleash === null) {
            return this.getFallbackValue(name)
        }

        try {
            const unleashContext = context
                ? {
                      userId: context.userId,
                      properties: {
                          guildId: context.guildId,
                      },
                  }
                : undefined

            const enabled = unleash.isEnabled(name, unleashContext)

            if (!enabled) {
                return this.getFallbackValue(name)
            }

            return enabled
        } catch (error) {
            debugLog({
                message: `Error checking Unleash toggle ${name}, using fallback:`,
                error,
            })
            return this.getFallbackValue(name)
        }
    }

    getAllToggles(): Map<FeatureToggleName, boolean> {
        return new Map(this.fallbackToggles)
    }

    getToggle(name: FeatureToggleName): boolean {
        return this.getFallbackValue(name)
    }
}

export const featureToggleService = new FeatureToggleService()
