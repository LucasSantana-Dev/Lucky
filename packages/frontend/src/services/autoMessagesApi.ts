import type { AxiosInstance } from 'axios'
import type { AutoMessage, AutoMessageType } from '@/types'

export interface CreateAutoMessageInput {
    type: AutoMessageType
    message: string
    channelId?: string
    trigger?: string
    exactMatch?: boolean
}

export interface UpdateAutoMessageInput {
    message?: string
    channelId?: string
    trigger?: string
    exactMatch?: boolean
    enabled?: boolean
}

export function createAutoMessagesApi(apiClient: AxiosInstance) {
    return {
        list: (guildId: string) =>
            apiClient.get<{ messages: AutoMessage[] }>(
                `/guilds/${guildId}/automessages`,
            ),
        create: (guildId: string, data: CreateAutoMessageInput) =>
            apiClient.post<AutoMessage>(
                `/guilds/${guildId}/automessages`,
                data,
            ),
        update: (
            guildId: string,
            messageId: string,
            data: UpdateAutoMessageInput,
        ) =>
            apiClient.patch<AutoMessage>(
                `/guilds/${guildId}/automessages/${messageId}`,
                data,
            ),
        toggle: (guildId: string, messageId: string, enabled: boolean) =>
            apiClient.patch<{ success: boolean }>(
                `/guilds/${guildId}/automessages/${messageId}/toggle`,
                { enabled },
            ),
        delete: (guildId: string, messageId: string) =>
            apiClient.delete<{ success: boolean }>(
                `/guilds/${guildId}/automessages/${messageId}`,
            ),
    }
}
