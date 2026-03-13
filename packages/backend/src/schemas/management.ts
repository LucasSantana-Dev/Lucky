import { z } from 'zod'

const guildIdParam = z.object({
    guildId: z.string().regex(/^\d{17,20}$/, 'Invalid guild ID'),
})

const commandNameParam = guildIdParam.extend({
    name: z.string().min(1).max(32),
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

const guildAutomationManifestBody = z
    .object({
        version: z.number().int().min(1).max(100),
        guild: z.object({
            id: z.string().regex(/^\d{17,20}$/),
            name: z.string().max(100).optional(),
        }),
        onboarding: z.record(z.unknown()).optional(),
        roles: z.record(z.unknown()).optional(),
        moderation: z.record(z.unknown()).optional(),
        automessages: z.record(z.unknown()).optional(),
        reactionroles: z.record(z.unknown()).optional(),
        commandaccess: z.record(z.unknown()).optional(),
        parity: z.record(z.unknown()).optional(),
        source: z.enum(['discord-capture', 'manual']).optional(),
        capturedAt: z.string().datetime().optional(),
    })
    .strict()

const guildAutomationRunBody = z
    .object({
        actualState: guildAutomationManifestBody.optional(),
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
    userId: z.string().regex(/^\d{17,20}$/, 'Invalid user ID'),
})

export const managementSchemas = {
    guildIdParam,
    commandNameParam,
    autoModSettingsBody,
    guildAutomationManifestBody,
    guildAutomationRunBody,
    createCommandBody,
    updateCommandBody,
    logsQuery,
    logsSearchQuery,
    userIdParam,
}
