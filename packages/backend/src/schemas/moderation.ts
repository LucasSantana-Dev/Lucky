import { z } from 'zod'
import {
    guildIdParam,
    userIdParam as commonUserIdParam,
    snowflakeId,
} from './common'

const caseNumberParam = guildIdParam.extend({
    caseNumber: z.coerce.number().int().min(1),
})

const caseIdParam = guildIdParam.extend({
    caseId: z.string().min(1).max(100),
})

const userCasesParam = guildIdParam.extend({
    userId: commonUserIdParam.shape.userId,
})

const caseTypeFilter = z.enum([
    'warn',
    'mute',
    'kick',
    'ban',
    'timeout',
    'unban',
    'unmute',
])

const casesQuery = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(),
    type: caseTypeFilter.optional(),
    search: z.string().trim().min(1).max(200).optional(),
})

const userCasesQuery = z.object({
    activeOnly: z.enum(['true', 'false']).optional(),
})

const updateReasonBody = z.object({
    reason: z.string().min(1, 'Reason is required').max(1000),
})

const updateSettingsBody = z
    .object({
        logChannelId: snowflakeId.optional(),
        muteRoleId: snowflakeId.optional(),
        modRoles: z.array(snowflakeId).optional(),
        autoModEnabled: z.boolean().optional(),
        warnThreshold: z.number().int().min(1).max(50).optional(),
        warnAction: z.enum(['mute', 'kick', 'ban']).optional(),
        warnActionDuration: z.number().int().min(0).optional(),
    })
    .strict()

export const moderationSchemas = {
    guildIdParam,
    caseNumberParam,
    caseIdParam,
    userCasesParam,
    casesQuery,
    userCasesQuery,
    updateReasonBody,
    updateSettingsBody,
}
