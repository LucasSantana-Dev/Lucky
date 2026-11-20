import { z } from 'zod'
import { guildIdParam } from './common'

const embedNameParam = guildIdParam.extend({
    name: z.string().min(1).max(100),
})

// Only fields EmbedTemplate can store. `author` and `url` used to be declared
// here but no column, service or bot code ever read them, so a caller's value
// was accepted and silently dropped (#2444). Strict: unknown keys are a 400.
const embedDataSchema = z
    .object({
        title: z.string().max(256).optional(),
        description: z.string().max(4096).optional(),
        color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        thumbnail: z.string().url().max(2048).optional(),
        image: z.string().url().max(2048).optional(),
        footer: z.string().max(2048).optional(),
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
    .strict()

const createEmbedBody = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    embedData: embedDataSchema,
    description: z.string().max(500).optional(),
})

// Flat, matching what EmbedBuilder.tsx sends and what
// EmbedBuilderService.updateTemplate persists directly (no `embedData`
// wrapper). See #2407. Strict, like embedDataSchema: an unknown key such as
// `author`/`url` would 500 on the Prisma update. `description` keeps the same
// max (4096, matching createEmbedBody's embedData.description and the DB
// column) so edits to a template create had already accepted are not rejected.
// title/description/color/thumbnail/image/footer are widened to nullable here
// only: null explicitly clears an existing value on PATCH, which only makes
// sense once a template exists - createEmbedBody keeps them non-nullable
// (#2445 review, #2645).
const updateEmbedBody = embedDataSchema
    .extend({
        name: z.string().min(1).max(100).optional(),
        title: z.string().max(256).nullable().optional(),
        description: z.string().max(4096).nullable().optional(),
        color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .nullable()
            .optional(),
        thumbnail: z.string().url().max(2048).nullable().optional(),
        image: z.string().url().max(2048).nullable().optional(),
        footer: z.string().max(2048).nullable().optional(),
    })
    .strict()

export const embedSchemas = {
    guildIdParam,
    embedNameParam,
    createEmbedBody,
    updateEmbedBody,
}
