import type { Prisma } from '../../generated/prisma/client.js'
import type { GuildAutomationManifestDocument } from './types.js'
import { guildAutomationManifestSchema } from './manifestSchema.js'
import { errorLog } from '../../utils/general/log.js'

export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toManifestDocument(
    value: unknown,
): GuildAutomationManifestDocument {
    if (!isObject(value)) {
        throw new Error('Manifest payload is invalid')
    }

    const result = guildAutomationManifestSchema.safeParse(value)

    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
        }))
        errorLog({
            message: 'Failed to parse GuildAutomationManifest JSON',
            error: errors,
        })
        throw new Error(
            `Invalid manifest: ${result.error.issues[0]?.message ?? 'unknown error'}`,
        )
    }

    return result.data
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
    // Round-trip through JSON to verify serializability at runtime
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
        throw new Error('Value is not JSON-serializable')
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue
}
