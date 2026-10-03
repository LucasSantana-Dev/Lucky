import { PrismaPg } from '@prisma/adapter-pg'

const DEFAULT_POOL_MAX = 10
const MAX_POOL_MAX = 100

/** Pool size from DATABASE_POOL_MAX; invalid or non-positive or above 100 values fall back to 10. */
export function resolvePoolMax(raw = process.env.DATABASE_POOL_MAX): number {
    if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_POOL_MAX
    const parsed = Number(raw)
    return parsed > 0 && parsed <= MAX_POOL_MAX ? parsed : DEFAULT_POOL_MAX
}

/** Builds the Prisma pg adapter with an explicit pool size. */
export function createPgAdapter(connectionString: string): PrismaPg {
    return new PrismaPg({ connectionString, max: resolvePoolMax() })
}
