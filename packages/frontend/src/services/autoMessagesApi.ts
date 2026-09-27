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
    channelId?: string | null
    trigger?: string
    exactMatch?: boolean
    enabled?: boolean
}

/** Raw values held by the auto message create/edit form. */
export interface AutoMessageFormValues {
    type: AutoMessageType
    message: string
    channelId: string
    trigger: string
    exactMatch: boolean
}

/** Builds the exact payload the create form sends, from its raw field values. */
export function buildCreatePayload(
    form: AutoMessageFormValues,
): CreateAutoMessageInput {
    const isAutoResponse = form.type === 'auto_response'
    return {
        type: form.type,
        message: form.message,
        channelId: form.channelId.trim() === '' ? undefined : form.channelId,
        ...(isAutoResponse
            ? { trigger: form.trigger, exactMatch: form.exactMatch }
            : {}),
    }
}

/**
 * Builds the exact payload the edit form sends, from its raw field values.
 * An emptied channel field sends an explicit `null` so the backend clears it,
 * rather than omitting the key (which the backend treats as "no change").
 */
export function buildUpdatePayload(
    form: AutoMessageFormValues,
): UpdateAutoMessageInput {
    const isAutoResponse = form.type === 'auto_response'
    return {
        message: form.message,
        channelId: form.channelId.trim() === '' ? null : form.channelId,
        ...(isAutoResponse
            ? { trigger: form.trigger, exactMatch: form.exactMatch }
            : {}),
    }
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
