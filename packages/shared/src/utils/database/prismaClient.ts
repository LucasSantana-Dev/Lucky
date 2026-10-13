import { createPgAdapter } from './pgAdapter'
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js'
import { createRequire } from 'module'

let _require: NodeRequire
try {
    _require = createRequire(import.meta.url)
} catch {
    _require = require
}

let prismaInstance: PrismaClient | null = null

/** Returns a singleton Prisma client instance, initializing if necessary. */
export function getPrismaClient(): PrismaClient {
    if (!prismaInstance) {
        const { PrismaClient: PrismaClientConstructor } = _require(
            '../../generated/prisma/client.js',
        ) as {
            PrismaClient: new (options?: unknown) => PrismaClient
        }
        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is required')
        }
        const adapter = createPgAdapter(databaseUrl)
        prismaInstance = new PrismaClientConstructor({ adapter })
    }
    return prismaInstance
}

/** Disconnects the Prisma client if it is initialized. */
export function disconnectPrisma(): Promise<void> {
    if (prismaInstance) {
        return prismaInstance.$disconnect()
    }
    return Promise.resolve()
}

/**
 * Returns Prisma's `DbNull` sentinel (SQL NULL for a nullable `Json?` column).
 * Writing a plain `null` to a `Json?` field is rejected by Prisma, so callers
 * that need to clear such a column in an update must pass this value.
 */
export function getDbNull(): typeof Prisma.DbNull {
    const { Prisma: PrismaNamespace } = _require(
        '../../generated/prisma/client.js',
    ) as { Prisma: { DbNull: typeof Prisma.DbNull } }
    return PrismaNamespace.DbNull
}
