import { z } from 'zod'

type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>

export function getValidated<T>(data: unknown, schema: Schema<T>): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`)
    }
    return result.data
}

export const stringParam = z.string().min(1)
