import { z } from 'zod'
import { guildIdParam, userIdParam as commonUserIdParam } from './common'

const caseNumberParam = guildIdParam.extend({
    caseNumber: z.coerce.number().int().min(1),
})

const caseIdParam = guildIdParam.extend({
    caseId: z.string().min(1).max(100),
})

const userCasesParam = commonUserIdParam

const casesQuery = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
})

const userCasesQuery = z.object({
    activeOnly: z.enum(['true', 'false']).optional(),
})

const updateReasonBody = z.object({
    reason: z.string().min(1, 'Reason is required').max(1000),
})

const updateSettingsBody = z
    .object({
        logChannelId: z
            .string()
            .regex(/^\d{17,20}$/)
            .optional(),
        muteRoleId: z
            .string()
            .regex(/^\d{17,20}$/)
            .optional(),
        modRoles: z.array(z.string().regex(/^\d{17,20}$/)).optional(),
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
