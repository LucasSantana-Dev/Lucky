import { beforeEach, describe, expect, test, jest } from '@jest/globals'

const countMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => ({
        guildRoleGrant: {
            count: (...args: unknown[]) => countMock(...args),
        },
    }),
}))

import { verifyRequiredDatabaseState } from '../../../src/startup/verifyRequiredDatabaseState'

describe('verifyRequiredDatabaseState', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('passes when guild_role_grants relation is available', async () => {
        countMock.mockResolvedValue(1)

        await expect(verifyRequiredDatabaseState()).resolves.toBeUndefined()
        expect(countMock).toHaveBeenCalledWith({ take: 1 })
    })

    test('maps missing relation error to actionable migration message', async () => {
        const prismaError = {
            code: 'P2021',
            meta: { table: 'guild_role_grants' },
        }
        countMock.mockRejectedValue(prismaError)

        try {
            await verifyRequiredDatabaseState()
            throw new Error('Expected verification to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect(error).toMatchObject({
                code: 'ERR_DB_SCHEMA_MISSING',
                message:
                    'Required database relation "guild_role_grants" is missing. Run migrations before starting backend.',
            })
            expect(error).toHaveProperty('cause', prismaError)
        }
    })

    test('uses default table name when prisma error omits meta.table', async () => {
        countMock.mockRejectedValue({
            code: 'P2021',
            meta: {},
        })

        await expect(verifyRequiredDatabaseState()).rejects.toThrow(
            'Required database relation "guild_role_grants" is missing. Run migrations before starting backend.',
        )
    })

    test('rethrows unknown prisma errors unchanged', async () => {
        const error = new Error('database offline')
        countMock.mockRejectedValue(error)

        await expect(verifyRequiredDatabaseState()).rejects.toBe(error)
    })
})
