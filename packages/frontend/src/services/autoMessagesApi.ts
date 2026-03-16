import type { AxiosInstance } from 'axios'
import type { AutoMessage } from '@/types'

export interface CreateAutoMessageInput {
    name: string
    channel: string
    content: string
    interval: number
    isEmbed?: boolean
}

export interface UpdateAutoMessageInput {
    name?: string
    channel?: string
    content?: string
    interval?: number
    isEmbed?: boolean
    enabled?: boolean
}

export function createAutoMessagesApi(apiClient: AxiosInstance) {
    return {
        list: (guildId: string) =>
            apiClient.get<{ messages: AutoMessage[] }>(
                `/guilds/${guildId}/automessages`,
            ),
        create: (guildId: string, data: CreateAutoMessageInput) =>
            apiClient.post<{ message: AutoMessage }>(
                `/guilds/${guildId}/automessages`,
                data,
            ),
        update: (
            guildId: string,
            messageId: string,
            data: UpdateAutoMessageInput,
        ) =>
            apiClient.patch<{ message: AutoMessage }>(
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
