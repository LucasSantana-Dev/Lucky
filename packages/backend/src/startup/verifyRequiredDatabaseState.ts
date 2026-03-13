import { getPrismaClient } from '@lucky/shared/utils'

const prisma = getPrismaClient()

export async function verifyRequiredDatabaseState(): Promise<void> {
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
            throw new Error(
                `Required database relation "${table}" is missing. Run migrations before starting backend.`,
            )
        }

        throw error
    }
}
