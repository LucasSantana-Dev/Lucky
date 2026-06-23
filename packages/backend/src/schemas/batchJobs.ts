import { z } from 'zod'
import { guildIdParam } from './common'

const jobIdParam = guildIdParam.extend({
    jobId: z.string().min(1).max(100),
})

const listQuery = z.object({
    status: z
        .enum([
            'pending',
            'in_progress',
            'paused',
            'completed',
            'failed',
            'cancelled',
        ])
        .optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
})

export const batchJobsSchemas = {
    guildIdParam,
    jobIdParam,
    listQuery,
}
