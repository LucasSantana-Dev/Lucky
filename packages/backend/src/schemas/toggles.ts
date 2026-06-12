import { z } from 'zod'

const toggleNameParam = z.object({
    name: z.string().min(1).max(64),
})

const toggleEnabledBody = z.object({
    enabled: z.boolean(),
})

export const togglesSchemas = {
    toggleNameParam,
    toggleEnabledBody,
}
