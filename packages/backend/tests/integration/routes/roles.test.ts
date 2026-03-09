import { errorHandler } from '../../../src/middleware/errorHandler'
import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { setupRolesRoutes } from '../../../src/routes/roles'
import { setupSessionMiddleware } from '../../../src/middleware/session'
import { sessionService } from '../../../src/services/SessionService'
import { MOCK_SESSION_DATA } from '../../fixtures/mock-data'

jest.mock('../../../src/services/SessionService', () => ({
    sessionService: {
        getSession: jest.fn(),
    },
}))

const mockListReactionRoles = jest.fn<any>()
const mockListExclusiveRoles = jest.fn<any>()

jest.mock('@lucky/shared/services', () => ({
    reactionRolesService: {
        listReactionRoleMessages: (...args: any[]) =>
            mockListReactionRoles(...args),
    },
    roleManagementService: {
        listExclusiveRoles: (...args: any[]) => mockListExclusiveRoles(...args),
    },
}))

describe('Roles Routes', () => {
    let app: express.Express

    beforeEach(() => {
        app = express()
        app.use(express.json())
        setupSessionMiddleware(app)
        setupRolesRoutes(app)
        app.use(errorHandler)
        jest.clearAllMocks()
    })

    const GUILD_ID = '111111111111111111'

    function authed() {
        const mock = sessionService as jest.Mocked<typeof sessionService>
        mock.getSession.mockResolvedValue(MOCK_SESSION_DATA)
    }

    describe('GET /api/guilds/:guildId/reaction-roles', () => {
        test('should list reaction role messages', async () => {
            authed()
            const messages = [
                {
                    id: 'rrm-1',
                    messageId: '555555555555555555',
                    channelId: '444444444444444444',
                    guildId: GUILD_ID,
                    mappings: [
                        {
                            roleId: '666666666666666666',
                            label: 'Red Team',
                        },
                    ],
                },
            ]
            mockListReactionRoles.mockResolvedValue(messages)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/reaction-roles`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.messages).toHaveLength(1)
            expect(mockListReactionRoles).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return 401 without auth', async () => {
            const mock = sessionService as jest.Mocked<typeof sessionService>
            mock.getSession.mockResolvedValue(null)

            const res = await request(app).get(
                `/api/guilds/${GUILD_ID}/reaction-roles`,
            )

            expect(res.status).toBe(401)
        })
    })

    describe('GET /api/guilds/:guildId/roles/exclusive', () => {
        test('should list exclusive role rules', async () => {
            authed()
            const exclusions = [
                {
                    id: 'exc-1',
                    guildId: GUILD_ID,
                    roleId: '777777777777777777',
                    excludedRoleId: '888888888888888888',
                },
            ]
            mockListExclusiveRoles.mockResolvedValue(exclusions)

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/roles/exclusive`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.exclusions).toHaveLength(1)
            expect(mockListExclusiveRoles).toHaveBeenCalledWith(GUILD_ID)
        })

        test('should return empty array for guild with no rules', async () => {
            authed()
            mockListExclusiveRoles.mockResolvedValue([])

            const res = await request(app)
                .get(`/api/guilds/${GUILD_ID}/roles/exclusive`)
                .set('Cookie', ['sessionId=valid_session_id'])

            expect(res.status).toBe(200)
            expect(res.body.exclusions).toHaveLength(0)
        })
    })
})
