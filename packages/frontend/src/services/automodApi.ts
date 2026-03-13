import type { AxiosInstance } from 'axios'
import type { AutoModSettings, AutoModTemplate } from '@/types'

export type AutoModApiClient = Pick<
    AxiosInstance,
    'get' | 'patch' | 'post' | 'delete'
>

function encodeGuildSegment(guildId: string): string {
    return encodeURIComponent(guildId)
}

export function createAutoModApi(apiClient: AutoModApiClient) {
    return {
        getSettings: (guildId: string) =>
            apiClient.get<{ settings: AutoModSettings }>(
                `/guilds/${guildId}/automod/settings`,
            ),
        updateSettings: (guildId: string, settings: Partial<AutoModSettings>) =>
            apiClient.patch<{ settings: AutoModSettings }>(
                `/guilds/${guildId}/automod/settings`,
                settings,
            ),
        listTemplates: (guildId: string) =>
            apiClient.get<{ templates: AutoModTemplate[] }>(
                `/guilds/${encodeGuildSegment(guildId)}/automod/templates`,
            ),
        applyTemplate: (guildId: string, templateId: string) =>
            apiClient.post<{
                settings: AutoModSettings
                templateId: string
            }>(
                `/guilds/${encodeGuildSegment(guildId)}/automod/templates/${encodeURIComponent(templateId)}/apply`,
            ),
        addExemptChannel: (guildId: string, channelId: string) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/automod/exempt/channels`,
                { channelId },
            ),
        removeExemptChannel: (guildId: string, channelId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/automod/exempt/channels/${channelId}`,
            ),
        addExemptRole: (guildId: string, roleId: string) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/automod/exempt/roles`,
                { roleId },
            ),
        removeExemptRole: (guildId: string, roleId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/automod/exempt/roles/${roleId}`,
            ),
        addWord: (guildId: string, word: string) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/automod/words`,
                { word },
            ),
        removeWord: (guildId: string, word: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/automod/words/${encodeURIComponent(word)}`,
            ),
        addWhitelistedLink: (guildId: string, domain: string) =>
            apiClient.post<{ success: boolean }>(
                `/guilds/${guildId}/automod/links/whitelist`,
                { domain },
            ),
        removeWhitelistedLink: (guildId: string, domain: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/automod/links/whitelist/${encodeURIComponent(domain)}`,
            ),
    }
}
