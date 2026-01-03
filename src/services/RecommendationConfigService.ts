import { debugLog, errorLog } from '../utils/general/log'
import { guildSettingsService } from './GuildSettingsService'
import type { RecommendationConfig } from './MusicRecommendationService'
import type { GuildSettings } from './guildSettings/types'

export type GuildRecommendationSettings = {
    enabled: boolean
    maxRecommendations: number
    similarityThreshold: number
    genreWeight: number
    tagWeight: number
    artistWeight: number
    durationWeight: number
    popularityWeight: number
    diversityFactor: number
    learningEnabled: boolean
    historyWeight: number
}

export type ExtendedGuildSettings = GuildSettings & {
    recommendationSettings?: Partial<GuildRecommendationSettings>
}

export class RecommendationConfigService {
    private readonly defaultSettings: GuildRecommendationSettings = {
        enabled: true,
        maxRecommendations: 8,
        similarityThreshold: 0.4,
        genreWeight: 0.4,
        tagWeight: 0.3,
        artistWeight: 0.2,
        durationWeight: 0.05,
        popularityWeight: 0.05,
        diversityFactor: 0.1,
        learningEnabled: true,
        historyWeight: 0.3,
    }

    /**
     * Get recommendation settings for a guild
     */
    async getGuildSettings(
        guildId: string,
    ): Promise<GuildRecommendationSettings> {
        try {
            const settings = await guildSettingsService.getGuildSettings(guildId)

            if (!settings) {
                return { ...this.defaultSettings }
            }

            // For now, we'll store recommendation settings separately
            // This could be extended to use a separate Redis key or database table
            const recommendationSettings = (settings as { recommendationSettings?: unknown })
                ?.recommendationSettings

            if (recommendationSettings) {
                return {
                    ...this.defaultSettings,
                    ...(recommendationSettings as Record<string, unknown>),
                }
            }

            return { ...this.defaultSettings }
        } catch (error) {
            errorLog({
                message: 'Error getting guild recommendation settings:',
                error,
            })
            return { ...this.defaultSettings }
        }
    }

    /**
     * Update recommendation settings for a guild
     */
    async updateGuildSettings(
        guildId: string,
        settings: Partial<GuildRecommendationSettings>,
    ): Promise<void> {
        try {
            const currentSettings = await guildSettingsService.getGuildSettings(guildId)

            if (!currentSettings) {
                throw new Error('No current guild settings found')
            }

            const extendedCurrentSettings = currentSettings as unknown as ExtendedGuildSettings
            const currentRecommendationSettings =
                extendedCurrentSettings?.recommendationSettings || {}

            const updatedSettings = {
                ...currentSettings,
                recommendationSettings: {
                    ...currentRecommendationSettings,
                    ...settings,
                },
            } as unknown as ExtendedGuildSettings

            const success = await guildSettingsService.updateGuildSettings(
                guildId,
                updatedSettings,
            )

            if (!success) {
                throw new Error('Failed to update guild settings')
            }

            debugLog({
                message: 'Updated guild recommendation settings',
                data: { guildId, settings },
            })
        } catch (error) {
            errorLog({
                message: 'Error updating guild recommendation settings:',
                error,
            })
            throw error
        }
    }

    /**
     * Convert guild settings to recommendation config
     */
    guildSettingsToConfig(
        settings: GuildRecommendationSettings,
    ): RecommendationConfig {
        return {
            maxRecommendations: settings.maxRecommendations,
            similarityThreshold: settings.similarityThreshold,
            genreWeight: settings.genreWeight,
            tagWeight: settings.tagWeight,
            artistWeight: settings.artistWeight,
            durationWeight: settings.durationWeight,
            popularityWeight: settings.popularityWeight,
            diversityFactor: settings.diversityFactor,
        }
    }

    /**
     * Get preset configurations for different music styles
     */
    getPresetConfigurations(): Record<
        string,
        Partial<GuildRecommendationSettings>
    > {
        return {
            balanced: {
                similarityThreshold: 0.4,
                genreWeight: 0.4,
                tagWeight: 0.3,
                artistWeight: 0.2,
                durationWeight: 0.05,
                popularityWeight: 0.05,
                diversityFactor: 0.1,
            },
            'genre-focused': {
                similarityThreshold: 0.5,
                genreWeight: 0.6,
                tagWeight: 0.2,
                artistWeight: 0.1,
                durationWeight: 0.05,
                popularityWeight: 0.05,
                diversityFactor: 0.05,
            },
            'artist-focused': {
                similarityThreshold: 0.3,
                genreWeight: 0.2,
                tagWeight: 0.2,
                artistWeight: 0.5,
                durationWeight: 0.05,
                popularityWeight: 0.05,
                diversityFactor: 0.15,
            },
            diverse: {
                similarityThreshold: 0.2,
                genreWeight: 0.3,
                tagWeight: 0.3,
                artistWeight: 0.2,
                durationWeight: 0.1,
                popularityWeight: 0.1,
                diversityFactor: 0.3,
            },
            similar: {
                similarityThreshold: 0.6,
                genreWeight: 0.5,
                tagWeight: 0.4,
                artistWeight: 0.1,
                durationWeight: 0.0,
                popularityWeight: 0.0,
                diversityFactor: 0.0,
            },
        }
    }

    /**
     * Apply a preset configuration to a guild
     */
    async applyPreset(guildId: string, presetName: string): Promise<void> {
        const presets = this.getPresetConfigurations()
        const preset = presets[presetName]

        if (!preset) {
            throw new Error(`Unknown preset: ${presetName}`)
        }

        await this.updateGuildSettings(guildId, preset)

        debugLog({
            message: 'Applied recommendation preset',
            data: { guildId, presetName, preset },
        })
    }

    /**
     * Get available preset names
     */
    getAvailablePresets(): string[] {
        return Object.keys(this.getPresetConfigurations())
    }

    /**
     * Reset guild settings to defaults
     */
    async resetGuildSettings(guildId: string): Promise<void> {
        await this.updateGuildSettings(guildId, this.defaultSettings)

        debugLog({
            message: 'Reset guild recommendation settings to defaults',
            data: { guildId },
        })
    }

    /**
     * Get global recommendation statistics
     */
    async getGlobalStats(): Promise<{
        totalGuilds: number
        averageSettings: Partial<GuildRecommendationSettings>
        mostUsedPresets: Record<string, number>
    }> {
        try {
            return {
                totalGuilds: 0,
                averageSettings: this.defaultSettings,
                mostUsedPresets: {},
            }
        } catch (error) {
            errorLog({
                message: 'Error getting global recommendation stats:',
                error,
            })
            return {
                totalGuilds: 0,
                averageSettings: this.defaultSettings,
                mostUsedPresets: {},
            }
        }
    }

    /**
     * Get recommendation settings for a guild
     */
    async getSettings(guildId: string): Promise<GuildRecommendationSettings> {
        return this.getGuildSettings(guildId)
    }

    /**
     * Update recommendation settings for a guild
     */
    async updateSettings(guildId: string, updates: Partial<GuildRecommendationSettings>): Promise<void> {
        await this.updateGuildSettings(guildId, updates)
    }

    /**
     * Reset recommendation settings to defaults
     */
    async resetSettings(guildId: string): Promise<void> {
        await this.resetGuildSettings(guildId)
    }
}

export const recommendationConfigService = new RecommendationConfigService()
