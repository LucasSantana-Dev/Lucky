import { getPrismaClient } from '@lucky/shared/utils'

const MISSING_SCHEMA_ERROR_CODE = 'ERR_DB_SCHEMA_MISSING'

type DatabaseStartupError = Error & { code?: string }

export async function verifyRequiredDatabaseState(): Promise<void> {
    const prisma = getPrismaClient()

    try {
        await prisma.guildRoleGrant.count({
            take: 1,
        })
    } catch (error) {
        const maybePrismaError = error as {
            code?: string
            message?: string
            meta?: { table?: string }
        }

        if (maybePrismaError.code === 'P2021') {
            const table = maybePrismaError.meta?.table ?? 'guild_role_grants'
            const startupError = new Error(
                `Required database relation "${table}" is missing. Run migrations before starting backend.`,
                { cause: error },
            ) as DatabaseStartupError
            startupError.code = MISSING_SCHEMA_ERROR_CODE
            throw startupError
        }

        throw error
    }
}
