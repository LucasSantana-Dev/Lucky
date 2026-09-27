import { z } from 'zod'
import { guildIdParam } from './common'

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
    // Nullable so a PATCH can explicitly clear an existing value (null),
    // distinct from omitting the key (leave unchanged) - see #2407 review.
    thumbnail: z.string().url().max(2048).nullable().optional(),
    image: z.string().url().max(2048).nullable().optional(),
    author: z
        .object({
            name: z.string().max(256).optional(),
            icon_url: z.string().url().max(2048).optional(),
            url: z.string().url().max(2048).optional(),
        })
        .optional(),
    footer: z.string().max(2048).nullable().optional(),
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

// Flat, matching what EmbedBuilder.tsx sends and what
// EmbedBuilderService.updateTemplate persists directly (no `embedData`
// wrapper). See #2407. `author`/`url` are omitted: EmbedTemplate has no
// columns for them (kept in embedDataSchema only for #2444) and letting
// them through here 500s on the Prisma update. `description` is inherited
// from embedDataSchema (max 4096, matching createEmbedBody's embedData.description
// and the DB column) rather than redeclared - a stricter override here would
// reject edits to a template whose description create had already accepted.
const updateEmbedBody = embedDataSchema
    .omit({ author: true, url: true })
    .extend({
        name: z.string().min(1).max(100).optional(),
    })
    .strict()

export const embedSchemas = {
    guildIdParam,
    embedNameParam,
    createEmbedBody,
    updateEmbedBody,
}
