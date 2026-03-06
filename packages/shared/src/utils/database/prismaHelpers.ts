/**
 * Prisma Type Utilities
 * Provides typed Prisma client with model delegates
 *
 * Due to ESM module resolution issues, @prisma/client doesn't expose full model types
 * in TypeScript. This utility provides minimal-cast type helpers.
 */

import type { PrismaClient } from '@prisma/client'

/**
 * Prisma client typed with common model delegates
 * Used when full typing isn't available from ESM modules
 */
export type TypedPrisma = PrismaClient & {
    embedTemplate: any
    autoMessage: any
    autoModSettings: any
    moderationCase: any
    moderationSettings: any
    customCommand: any
    serverLog: any
    [key: string]: any
}

/**
 * Helper to properly type Prisma client without full `as any` casts
 * Usage: const prisma = typePrisma(getPrismaClient())
 */
export function typePrisma(client: any): TypedPrisma {
    return client as TypedPrisma
}
