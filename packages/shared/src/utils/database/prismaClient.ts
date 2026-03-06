import { createRequire } from 'module'
import type { PrismaClient as PrismaClientType } from '@prisma/client'

const require = createRequire(import.meta.url)

let prismaInstance: PrismaClientType | null = null

export function getPrismaClient(): PrismaClientType {
    if (!prismaInstance) {
        const { PrismaClient: PrismaClientConstructor } =
            require('@prisma/client') as {
                PrismaClient: new (options?: unknown) => PrismaClientType
            }
        const databaseUrl = process.env.DATABASE_URL
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is required')
        }
        prismaInstance = new PrismaClientConstructor({
            datasources: {
                db: {
                    url: databaseUrl,
                },
            },
        })
    }
    return prismaInstance
}

export function disconnectPrisma(): Promise<void> {
    if (prismaInstance) {
        return prismaInstance.$disconnect()
    }
    return Promise.resolve()
}
