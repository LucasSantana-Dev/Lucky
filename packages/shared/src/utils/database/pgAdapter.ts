import { PrismaPg } from '@prisma/adapter-pg'

const DEFAULT_POOL_MAX = 10

/** Pool size from DATABASE_POOL_MAX; invalid or non-positive values fall back to 10. */
export function resolvePoolMax(raw = process.env.DATABASE_POOL_MAX): number {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX
}

/** Builds the Prisma pg adapter with an explicit pool size. */
export function createPgAdapter(connectionString: string): PrismaPg {
    return new PrismaPg({ connectionString, max: resolvePoolMax() })
}
