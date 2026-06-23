import { z } from 'zod'
import { guildIdParam, userIdParam as commonUserIdParam } from './common'

const commandNameParam = guildIdParam.extend({
    name: z.string().min(1).max(32),
})

const autoModTemplateParam = guildIdParam.extend({
    templateId: z.string().regex(/^[a-z0-9-]{2,64}$/i, 'Invalid template ID'),
})

const autoModSettingsBody = z
    .object({
        enabled: z.boolean().optional(),
        spamEnabled: z.boolean().optional(),
        spamThreshold: z.number().int().min(1).max(100).optional(),
        spamTimeWindow: z.number().int().min(1).max(60).optional(),
        capsEnabled: z.boolean().optional(),
        capsThreshold: z.number().int().min(1).max(100).optional(),
        linksEnabled: z.boolean().optional(),
        allowedDomains: z.array(z.string().max(200)).optional(),
        invitesEnabled: z.boolean().optional(),
        wordsEnabled: z.boolean().optional(),
        bannedWords: z.array(z.string().max(100)).optional(),
        exemptChannels: z.array(z.string()).optional(),
        exemptRoles: z.array(z.string()).optional(),
    })
    .strict()

const guildAutomationManifestBody = z.unknown()

const guildAutomationRunBody = z
    .object({
        actualState: z.unknown().optional(),
        allowProtected: z.boolean().optional(),
        completeChecklist: z.boolean().optional(),
    })
    .strict()

const createCommandBody = z.object({
    name: z
        .string()
        .min(1, 'Name is required')
        .max(32)
        .regex(/^[\w-]+$/, 'Name must be alphanumeric with dashes/underscores'),
    response: z.string().min(1, 'Response is required').max(2000),
    description: z.string().max(100).optional(),
})

const updateCommandBody = z
    .object({
        response: z.string().min(1).max(2000).optional(),
        description: z.string().max(100).optional(),
        enabled: z.boolean().optional(),
    })
    .strict()

const logsQuery = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    type: z.string().max(50).optional(),
})

const logsSearchQuery = z.object({
    q: z.string().min(1, 'Search query is required').max(200),
    type: z.string().max(50).optional(),
    userId: z
        .string()
        .regex(/^\d{17,20}$/)
        .optional(),
})

const userIdParam = guildIdParam.extend({
    userId: commonUserIdParam.shape.userId,
})

const roleIdParam = guildIdParam.extend({
    roleId: z.string().regex(/^\d{17,20}$/),
})

const roleUpsertBody = z
    .object({
        name: z.string().min(1).max(100),
        color: z.number().int().min(0).max(0xffffff).optional(),
        hoist: z.boolean().optional(),
        mentionable: z.boolean().optional(),
        permissions: z
            .string()
            .regex(/^\d+$/, 'permissions must be a numeric bitfield string')
            .optional(),
    })
    .strict()

const bulkDeleteBody = z
    .object({
        roleIds: z
            .array(z.string().regex(/^\d{17,20}$/))
            .min(1)
            .max(50),
    })
    .strict()

const reactionRoleEntrySchema = z.object({
    roleId: z.string().regex(/^\d{17,20}$/, 'Invalid role ID'),
    label: z.string().min(1).max(80),
    emoji: z.string().max(100).optional(),
    style: z.enum(['Primary', 'Secondary', 'Success', 'Danger']).optional(),
})

const createReactionRoleBody = z
    .object({
        channelId: z.string().regex(/^\d{17,20}$/, 'Invalid channel ID'),
        title: z.string().min(1).max(256),
        description: z.string().min(1).max(4096),
        roles: z.array(reactionRoleEntrySchema).min(1).max(25),
    })
    .strict()
    .refine(
        (data) =>
            new Set(data.roles.map((r) => r.roleId)).size === data.roles.length,
        {
            message: 'Duplicate roleId entries are not allowed',
            path: ['roles'],
        },
    )

const messageIdParam = guildIdParam.extend({
    messageId: z.string().regex(/^\d{17,20}$/, 'Invalid message ID'),
})

export const managementSchemas = {
    guildIdParam,
    commandNameParam,
    autoModTemplateParam,
    autoModSettingsBody,
    guildAutomationManifestBody,
    guildAutomationRunBody,
    createCommandBody,
    updateCommandBody,
    logsQuery,
    logsSearchQuery,
    userIdParam,
    roleIdParam,
    roleUpsertBody,
    bulkDeleteBody,
    createReactionRoleBody,
    messageIdParam,
}
