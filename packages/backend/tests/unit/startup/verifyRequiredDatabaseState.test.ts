import { beforeEach, describe, expect, test, jest } from '@jest/globals'

const verifyRequiredDatabaseRelationsMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    verifyRequiredDatabaseRelations: (...args: unknown[]) =>
        verifyRequiredDatabaseRelationsMock(...args),
}))

import { verifyRequiredDatabaseState } from '../../../src/startup/verifyRequiredDatabaseState'

describe('verifyRequiredDatabaseState', () => {
    const missingRelationMessage =
        'Required database relation "guild_automation_runs" is missing. ' +
        'Run `npx prisma migrate deploy` before starting backend.'

    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('delegates schema verification to shared relation guard', async () => {
        verifyRequiredDatabaseRelationsMock.mockResolvedValue(undefined)

        await expect(verifyRequiredDatabaseState()).resolves.toBeUndefined()
        expect(verifyRequiredDatabaseRelationsMock).toHaveBeenCalledTimes(1)
    })

    test('propagates actionable missing-relation startup error unchanged', async () => {
        const missingRelationError = new Error(
            missingRelationMessage,
        ) as Error & { code?: string }
        missingRelationError.code = 'ERR_DB_SCHEMA_MISSING'
        verifyRequiredDatabaseRelationsMock.mockRejectedValueOnce(
            missingRelationError,
        )

        await expect(verifyRequiredDatabaseState()).rejects.toBe(
            missingRelationError,
        )
    })

    test('propagates unknown errors unchanged', async () => {
        const error = new Error('database offline')
        verifyRequiredDatabaseRelationsMock.mockRejectedValueOnce(error)

        await expect(verifyRequiredDatabaseState()).rejects.toBe(error)
    })
})
