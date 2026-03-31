import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const getTwitchUserAccessTokenMock = jest.fn()

jest.mock('./token', () => ({
    getTwitchUserAccessToken: getTwitchUserAccessTokenMock,
}))

import { getTwitchUserByLogin } from './twitchApi'

describe('twitchApi', () => {
    let fetchSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        fetchSpy = jest.spyOn(global, 'fetch')
        process.env.TWITCH_CLIENT_ID = 'test-client-id'
    })

    afterEach(() => {
        fetchSpy.mockRestore()
        delete process.env.TWITCH_CLIENT_ID
    })

    describe('getTwitchUserByLogin', () => {
        it('should return null if token is not available', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue(null)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should return null if client id is not available', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            delete process.env.TWITCH_CLIENT_ID

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should fetch user successfully', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    data: [
                        {
                            id: 'twitch123',
                            login: 'testuser',
                            display_name: 'TestUser',
                        },
                    ],
                }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toEqual({
                id: 'twitch123',
                login: 'testuser',
                display_name: 'TestUser',
            })
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('login=testuser'),
                expect.objectContaining({
                    headers: {
                        Authorization: 'Bearer valid-token',
                        'Client-Id': 'test-client-id',
                    },
                }),
            )
        })

        it('should encode username in query parameter', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ data: [] }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await getTwitchUserByLogin('test user')

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('login=test%20user'),
                expect.any(Object),
            )
        })

        it('should return null if response is not ok', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: false,
                status: 404,
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('nonexistent')

            expect(result).toBeNull()
        })

        it('should return null if no data in response', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ data: [] }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should return null on fetch error', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            fetchSpy.mockRejectedValue(new Error('Network error'))

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should return null if response data is malformed', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ data: null }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should handle json parse error', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        it('should use correct API endpoint', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    data: [
                        {
                            id: 'twitch123',
                            login: 'testuser',
                            display_name: 'TestUser',
                        },
                    ],
                }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            await getTwitchUserByLogin('testuser')

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.twitch.tv/helix/users?login=testuser',
                expect.any(Object),
            )
        })

        it('should extract first user from multiple results', async () => {
            getTwitchUserAccessTokenMock.mockResolvedValue('valid-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    data: [
                        {
                            id: 'first',
                            login: 'testuser',
                            display_name: 'First',
                        },
                        {
                            id: 'second',
                            login: 'testuser',
                            display_name: 'Second',
                        },
                    ],
                }),
            }
            fetchSpy.mockResolvedValue(mockResponse as any)

            const result = await getTwitchUserByLogin('testuser')

            expect(result?.id).toBe('first')
        })
    })
})
