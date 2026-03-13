import { describe, expect, test, jest } from '@jest/globals'
import {
    REQUIRED_DATABASE_RELATIONS,
    verifyRequiredDatabaseRelations,
} from '@lucky/shared/utils/requiredDatabaseRelations'

type CountMock = jest.MockedFunction<(args: { take: 1 }) => Promise<number>>

function createPrismaStub() {
    const guildRoleGrantCount = jest.fn(async () => 1) as CountMock
    const guildAutomationManifestCount = jest.fn(async () => 1) as CountMock
    const guildAutomationRunCount = jest.fn(async () => 1) as CountMock
    const guildAutomationDriftCount = jest.fn(async () => 1) as CountMock

    const prisma = {
        guildRoleGrant: { count: guildRoleGrantCount },
        guildAutomationManifest: { count: guildAutomationManifestCount },
        guildAutomationRun: { count: guildAutomationRunCount },
        guildAutomationDrift: { count: guildAutomationDriftCount },
    }

    return {
        prisma,
        guildRoleGrantCount,
        guildAutomationManifestCount,
        guildAutomationRunCount,
        guildAutomationDriftCount,
    }
}

function missingRelationMessage(table: string): string {
    return (
        `Required database relation "${table}" is missing. ` +
        'Run `npx prisma migrate deploy` before starting backend.'
    )
}

describe('verifyRequiredDatabaseRelations', () => {
    test('verifies all sentinel relations when schema is healthy', async () => {
        const {
            prisma,
            guildRoleGrantCount,
            guildAutomationManifestCount,
            guildAutomationRunCount,
            guildAutomationDriftCount,
        } = createPrismaStub()

        await expect(
            verifyRequiredDatabaseRelations(prisma),
        ).resolves.toBeUndefined()

        expect(REQUIRED_DATABASE_RELATIONS).toEqual([
            'guild_role_grants',
            'guild_automation_manifests',
            'guild_automation_runs',
            'guild_automation_drifts',
        ])
        expect(guildRoleGrantCount).toHaveBeenCalledWith({ take: 1 })
        expect(guildAutomationManifestCount).toHaveBeenCalledWith({ take: 1 })
        expect(guildAutomationRunCount).toHaveBeenCalledWith({ take: 1 })
        expect(guildAutomationDriftCount).toHaveBeenCalledWith({ take: 1 })
    })

    test('maps missing guild_role_grants relation to migration guidance', async () => {
        const { prisma, guildRoleGrantCount } = createPrismaStub()
        guildRoleGrantCount.mockRejectedValueOnce({
            code: 'P2021',
            meta: { table: 'guild_role_grants' },
        })

        await expect(verifyRequiredDatabaseRelations(prisma)).rejects.toMatchObject(
            {
                code: 'ERR_DB_SCHEMA_MISSING',
                message: missingRelationMessage('guild_role_grants'),
            },
        )
    })

    test('maps missing guild_automation_manifests relation to migration guidance', async () => {
        const { prisma, guildAutomationManifestCount } = createPrismaStub()
        guildAutomationManifestCount.mockRejectedValueOnce({
            code: 'P2021',
            meta: { table: 'guild_automation_manifests' },
        })

        await expect(verifyRequiredDatabaseRelations(prisma)).rejects.toMatchObject(
            {
                code: 'ERR_DB_SCHEMA_MISSING',
                message: missingRelationMessage('guild_automation_manifests'),
            },
        )
    })

    test('maps missing guild_automation_runs relation to migration guidance', async () => {
        const { prisma, guildAutomationRunCount } = createPrismaStub()
        guildAutomationRunCount.mockRejectedValueOnce({
            code: 'P2021',
            meta: { table: 'guild_automation_runs' },
        })

        await expect(verifyRequiredDatabaseRelations(prisma)).rejects.toMatchObject(
            {
                code: 'ERR_DB_SCHEMA_MISSING',
                message: missingRelationMessage('guild_automation_runs'),
            },
        )
    })

    test('maps missing guild_automation_drifts relation to migration guidance', async () => {
        const { prisma, guildAutomationDriftCount } = createPrismaStub()
        guildAutomationDriftCount.mockRejectedValueOnce({
            code: 'P2021',
            meta: { table: 'guild_automation_drifts' },
        })

        await expect(verifyRequiredDatabaseRelations(prisma)).rejects.toMatchObject(
            {
                code: 'ERR_DB_SCHEMA_MISSING',
                message: missingRelationMessage('guild_automation_drifts'),
            },
        )
    })

    test('rethrows non-P2021 errors unchanged', async () => {
        const { prisma, guildRoleGrantCount } = createPrismaStub()
        const error = new Error('database offline')
        guildRoleGrantCount.mockRejectedValueOnce(error)

        await expect(verifyRequiredDatabaseRelations(prisma)).rejects.toBe(error)
    })
})
