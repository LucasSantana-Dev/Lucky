import type { PrismaClient } from '../generated/prisma/client.js'

import { getPrismaClient } from './database/prismaClient'

export const REQUIRED_DATABASE_STATE_ERROR_CODE = 'ERR_DB_SCHEMA_MISSING'
export const REQUIRED_DATABASE_RELATIONS = [
    'guild_role_grants',
    'guild_automation_manifests',
    'guild_automation_runs',
    'guild_automation_drifts',
] as const

type RequiredDatabaseRelationsPrismaModels = Pick<
    PrismaClient,
    | 'guildRoleGrant'
    | 'guildAutomationManifest'
    | 'guildAutomationRun'
    | 'guildAutomationDrift'
>

export type RequiredDatabaseStatePrisma = {
    guildRoleGrant: Pick<
        RequiredDatabaseRelationsPrismaModels['guildRoleGrant'],
        'count'
    >
    guildAutomationManifest: Pick<
        RequiredDatabaseRelationsPrismaModels['guildAutomationManifest'],
        'count'
    >
    guildAutomationRun: Pick<
        RequiredDatabaseRelationsPrismaModels['guildAutomationRun'],
        'count'
    >
    guildAutomationDrift: Pick<
        RequiredDatabaseRelationsPrismaModels['guildAutomationDrift'],
        'count'
    >
}

type PrismaRelationError = {
    code?: string
    meta?: { table?: string }
}

type DatabaseStateError = Error & {
    code?: string
}

type RelationCheck = {
    table: (typeof REQUIRED_DATABASE_RELATIONS)[number]
    check: (prisma: RequiredDatabaseStatePrisma) => Promise<unknown>
}

const relationChecks: RelationCheck[] = [
    {
        table: 'guild_role_grants',
        check: (prisma) => prisma.guildRoleGrant.count({ take: 1 }),
    },
    {
        table: 'guild_automation_manifests',
        check: (prisma) => prisma.guildAutomationManifest.count({ take: 1 }),
    },
    {
        table: 'guild_automation_runs',
        check: (prisma) => prisma.guildAutomationRun.count({ take: 1 }),
    },
    {
        table: 'guild_automation_drifts',
        check: (prisma) => prisma.guildAutomationDrift.count({ take: 1 }),
    },
]

export async function verifyRequiredDatabaseRelations(
    prisma: RequiredDatabaseStatePrisma = getPrismaClient(),
): Promise<void> {
    for (const relationCheck of relationChecks) {
        try {
            await relationCheck.check(prisma)
        } catch (error) {
            const prismaError = error as PrismaRelationError
            if (prismaError.code !== 'P2021') {
                throw error
            }

            const table = prismaError.meta?.table ?? relationCheck.table
            const startupError = new Error(
                `Required database relation "${table}" is missing. ` +
                    'Run `npx prisma migrate deploy` before starting backend.',
                { cause: error },
            ) as DatabaseStateError
            startupError.code = REQUIRED_DATABASE_STATE_ERROR_CODE
            throw startupError
        }
    }
}
