import { PrismaPg } from '@prisma/adapter-pg'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { createRequire } from 'module'

let _require: NodeRequire
try {
    _require = createRequire(import.meta.url)
} catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _require = require
}

let prismaInstance: PrismaClient | null = null

export function getPrismaClient(): PrismaClient {
    if (!prismaInstance) {
        const { PrismaClient: PrismaClientConstructor } = _require(
            '../../generated/prisma/client.js',
        ) as {
            PrismaClient: new (
                options?: unknown,
            ) => PrismaClient
        }
        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
            throw new Error(
                'DATABASE_URL environment variable is required',
            )
        }
        const adapter = new PrismaPg({
            connectionString: databaseUrl,
        })
        prismaInstance = new PrismaClientConstructor({ adapter })
    }
    return prismaInstance
}

export function disconnectPrisma(): Promise<void> {
    if (prismaInstance) {
        return prismaInstance.$disconnect()
    }
    return Promise.resolve()
}
