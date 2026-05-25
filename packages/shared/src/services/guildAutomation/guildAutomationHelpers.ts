import type { Prisma } from '../../generated/prisma/client.js'
import type { GuildAutomationManifestDocument } from './types.js'
import { guildAutomationManifestSchema } from './manifestSchema.js'

export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toManifestDocument(
    value: unknown,
): GuildAutomationManifestDocument {
    if (!isObject(value)) {
        throw new Error('Manifest payload is invalid')
    }

    return guildAutomationManifestSchema.parse(value)
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
    // Round-trip through JSON to verify serializability at runtime
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
        throw new Error('Value is not JSON-serializable')
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue
}
