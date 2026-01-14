declare module '@prisma/client' {
    export class PrismaClient {
        constructor(options?: unknown)
        $connect(): Promise<void>
        $disconnect(): Promise<void>
        $queryRaw<T = unknown>(query: unknown): Promise<T>
        user: {
            upsert(args: unknown): Promise<unknown>
            findUnique(args: unknown): Promise<unknown | null>
        }
        guild: {
            upsert(args: unknown): Promise<unknown>
            findUnique(args: unknown): Promise<unknown | null>
        }
        trackHistory: {
            create(args: unknown): Promise<unknown>
            findMany(args: unknown): Promise<unknown[]>
            groupBy(args: unknown): Promise<unknown[]>
            deleteMany(args: unknown): Promise<{ count: number }>
        }
        commandUsage: {
            create(args: unknown): Promise<unknown>
            deleteMany(args: unknown): Promise<{ count: number }>
        }
        rateLimit: {
            findUnique(args: unknown): Promise<unknown | null>
            upsert(args: unknown): Promise<unknown>
            update(args: unknown): Promise<unknown>
            deleteMany(args: unknown): Promise<{ count: number }>
        }
        reactionRoleMessage: {
            create(args: unknown): Promise<unknown>
            findUnique(args: unknown): Promise<unknown | null>
            findMany(args: unknown): Promise<unknown[]>
            delete(args: unknown): Promise<unknown>
        }
        reactionRoleMapping: {
            findFirst(args: unknown): Promise<unknown | null>
        }
        roleExclusion: {
            upsert(args: unknown): Promise<unknown>
            findMany(args: unknown): Promise<unknown[]>
            deleteMany(args: unknown): Promise<unknown>
        }
    }
}
