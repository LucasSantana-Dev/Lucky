import type { AxiosInstance } from 'axios'

export interface EmbedField {
    name: string
    value: string
    inline?: boolean
}

export interface EmbedData {
    title?: string
    description?: string
    color?: string
    footer?: string
    thumbnail?: string
    image?: string
    fields?: EmbedField[]
}

export interface EmbedTemplate {
    id: string
    guildId: string
    name: string
    title: string | null
    description: string | null
    color: string | null
    footer: string | null
    thumbnail: string | null
    image: string | null
    fields: EmbedField[]
    useCount: number
    createdBy: string
    createdAt: string
    updatedAt: string
}

export interface CreateEmbedInput {
    name: string
    description?: string
    embedData: EmbedData
}

export interface UpdateEmbedInput {
    title?: string
    description?: string
    color?: string
    // null explicitly clears an existing value; undefined leaves it unchanged.
    footer?: string | null
    thumbnail?: string | null
    image?: string | null
    fields?: EmbedField[]
}

export interface EmbedFormValues {
    name: string
    title: string
    description: string
    color: string
    footer: string
    thumbnail: string
    image: string
    fields: EmbedField[]
}

export function buildCreateEmbedInput(form: EmbedFormValues): CreateEmbedInput {
    return {
        name: form.name,
        embedData: {
            title: form.title || undefined,
            description: form.description || undefined,
            color: form.color || undefined,
            footer: form.footer || undefined,
            thumbnail: form.thumbnail || undefined,
            image: form.image || undefined,
            fields: form.fields.length > 0 ? form.fields : undefined,
        },
    }
}

export function buildUpdateEmbedInput(form: EmbedFormValues): UpdateEmbedInput {
    return {
        title: form.title || undefined,
        description: form.description || undefined,
        color: form.color || undefined,
        // null (not undefined) so a blanked field explicitly clears
        // the existing value on the template instead of the PATCH
        // silently omitting the key and leaving it unchanged (#2407 review).
        footer: form.footer || null,
        thumbnail: form.thumbnail || null,
        image: form.image || null,
        fields: form.fields.length > 0 ? form.fields : undefined,
    }
}

export function createEmbedsApi(client: AxiosInstance) {
    return {
        list: async (guildId: string): Promise<EmbedTemplate[]> => {
            const res = await client.get<{ templates: EmbedTemplate[] }>(
                `/guilds/${guildId}/embeds`,
            )
            return res.data.templates
        },

        create: async (
            guildId: string,
            input: CreateEmbedInput,
        ): Promise<EmbedTemplate> => {
            const res = await client.post<EmbedTemplate>(
                `/guilds/${guildId}/embeds`,
                input,
            )
            return res.data
        },

        update: async (
            guildId: string,
            name: string,
            input: UpdateEmbedInput,
        ): Promise<EmbedTemplate> => {
            const res = await client.patch<EmbedTemplate>(
                `/guilds/${guildId}/embeds/${encodeURIComponent(name)}`,
                input,
            )
            return res.data
        },

        delete: async (guildId: string, name: string): Promise<void> => {
            await client.delete(
                `/guilds/${guildId}/embeds/${encodeURIComponent(name)}`,
            )
        },
    }
}
