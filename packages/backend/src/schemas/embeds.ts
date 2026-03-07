import { z } from 'zod'

const guildIdParam = z.object({
    guildId: z.string().regex(/^\d{17,20}$/, 'Invalid guild ID'),
})

const embedNameParam = guildIdParam.extend({
    name: z.string().min(1).max(100),
})

const embedDataSchema = z.object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    url: z.string().url().max(2048).optional(),
    thumbnail: z.object({ url: z.string().url().max(2048) }).optional(),
    image: z.object({ url: z.string().url().max(2048) }).optional(),
    author: z
        .object({
            name: z.string().max(256).optional(),
            icon_url: z.string().url().max(2048).optional(),
            url: z.string().url().max(2048).optional(),
        })
        .optional(),
    footer: z
        .object({
            text: z.string().max(2048).optional(),
            icon_url: z.string().url().max(2048).optional(),
        })
        .optional(),
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

const createEmbedBody = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    embedData: embedDataSchema,
    description: z.string().max(500).optional(),
})

const updateEmbedBody = z
    .object({
        embedData: embedDataSchema.optional(),
        description: z.string().max(500).optional(),
        name: z.string().min(1).max(100).optional(),
    })
    .strict()

export const embedSchemas = {
    guildIdParam,
    embedNameParam,
    createEmbedBody,
    updateEmbedBody,
}
