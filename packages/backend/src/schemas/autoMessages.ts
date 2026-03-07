import { z } from 'zod'

const guildIdParam = z.object({
    guildId: z.string().regex(/^\d{17,20}$/, 'Invalid guild ID'),
})

const messageIdParam = guildIdParam.extend({
    id: z.string().min(1).max(100),
})

const createMessageBody = z.object({
    type: z.enum(['welcome', 'leave', 'auto_response'], {
        required_error: 'Type is required',
    }),
    message: z.string().min(1, 'Message is required').max(2000),
    channelId: z
        .string()
        .regex(/^\d{17,20}$/)
        .optional(),
    trigger: z.string().max(200).optional(),
    exactMatch: z.boolean().optional(),
    cronSchedule: z.string().max(100).optional(),
})

const updateMessageBody = z
    .object({
        message: z.string().min(1).max(2000).optional(),
        channelId: z
            .string()
            .regex(/^\d{17,20}$/)
            .optional(),
        trigger: z.string().max(200).optional(),
        exactMatch: z.boolean().optional(),
        cronSchedule: z.string().max(100).optional(),
        enabled: z.boolean().optional(),
    })
    .strict()

const toggleBody = z.object({
    enabled: z.boolean({ required_error: 'Enabled is required' }),
})

const messagesQuery = z.object({
    type: z.string().max(50).optional(),
})

export const autoMessageSchemas = {
    guildIdParam,
    messageIdParam,
    createMessageBody,
    updateMessageBody,
    toggleBody,
    messagesQuery,
}
