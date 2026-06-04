import { z } from 'zod'

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

// Zod schema for validating EmbedData shape and constraints (Discord API limits)
export const embedDataSchema = z
    .object({
        title: z.string().max(256).optional(),
        description: z.string().max(4096).optional(),
        color: z
            .string()
            .regex(/^#[0-9A-Fa-f]{6}$/)
            .optional(),
        footer: z.string().max(2048).optional(),
        thumbnail: z.string().optional(),
        image: z.string().optional(),
        fields: z
            .array(
                z.object({
                    name: z.string().min(1).max(256),
                    value: z.string().min(1).max(1024),
                    inline: z.boolean().optional(),
                }),
            )
            .max(25)
            .optional(),
    })
    .refine(
        (data) => {
            // Embed must have at least one of title, description, or fields
            return (
                data.title ||
                data.description ||
                (data.fields && data.fields.length > 0)
            )
        },
        {
            message: 'Embed must have at least a title, description, or fields',
            path: ['root'],
        },
    )

export function validateEmbedData(embedData: Partial<EmbedData>): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []
    const hasContent =
        embedData.title || embedData.description || embedData.fields?.length

    if (!hasContent) {
        errors.push('Embed must have at least a title, description, or fields')
    }
    if (embedData.title && embedData.title.length > 256) {
        errors.push('Title must be 256 characters or less')
    }
    if (embedData.description && embedData.description.length > 4096) {
        errors.push('Description must be 4096 characters or less')
    }
    if (embedData.color && !/^#[0-9A-Fa-f]{6}$/.test(embedData.color)) {
        errors.push('Color must be a valid hex code (e.g. #5865F2)')
    }

    return { valid: errors.length === 0, errors }
}

export function hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16)
}

export function decimalToHex(decimal: number): string {
    return '#' + decimal.toString(16).toUpperCase().padStart(6, '0')
}
