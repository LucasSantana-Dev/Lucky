import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('./token.js', () => ({
    getTwitchUserAccessToken: jest.fn(),
}))

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

import { getTwitchUserByLogin } from './twitchApi.js'
import { getTwitchUserAccessToken } from './token.js'

const getTwitchTokenMock = getTwitchUserAccessToken as jest.MockedFunction<any>
const fetchMock = global.fetch as jest.MockedFunction<any>

beforeEach(() => {
    jest.clearAllMocks()
    process.env.TWITCH_CLIENT_ID = 'test-client-id'
})

describe('twitchApi', () => {
    describe('getTwitchUserByLogin', () => {
        test('fetches user from Twitch API', async () => {
            const mockUser = {
                id: 'twitch-123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [mockUser] }),
            })

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toEqual(mockUser)
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('login=testuser'),
                {
                    headers: {
                        Authorization: 'Bearer test-token',
                        'Client-Id': 'test-client-id',
                    },
                },
            )
        })

        test('returns null when no token available', async () => {
            getTwitchTokenMock.mockResolvedValueOnce(null)

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('returns null when TWITCH_CLIENT_ID not set', async () => {
            delete process.env.TWITCH_CLIENT_ID
            getTwitchTokenMock.mockResolvedValueOnce('test-token')

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
            expect(fetchMock).not.toHaveBeenCalled()
        })

        test('returns null when API returns error', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockResolvedValueOnce({
                ok: false,
            })

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        test('returns null when user not found in response', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [] }),
            })

            const result = await getTwitchUserByLogin('nonexistent')

            expect(result).toBeNull()
        })

        test('returns null on network error', async () => {
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockRejectedValueOnce(new Error('Network error'))

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toBeNull()
        })

        test('encodes username in URL', async () => {
            const mockUser = {
                id: 'twitch-123',
                login: 'user@special',
                display_name: 'User Special',
            }
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [mockUser] }),
            })

            await getTwitchUserByLogin('user@special')

            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('login=user%40special'),
                expect.anything(),
            )
        })

        test('uses correct headers', async () => {
            const mockUser = {
                id: 'twitch-123',
                login: 'testuser',
                display_name: 'TestUser',
            }
            getTwitchTokenMock.mockResolvedValueOnce('my-token')
            process.env.TWITCH_CLIENT_ID = 'my-client-id'
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [mockUser] }),
            })

            await getTwitchUserByLogin('testuser')

            const call = fetchMock.mock.calls[0]
            expect(call[1].headers).toEqual({
                Authorization: 'Bearer my-token',
                'Client-Id': 'my-client-id',
            })
        })

        test('returns first user when multiple match', async () => {
            const firstUser = {
                id: 'id-1',
                login: 'testuser',
                display_name: 'First',
            }
            const secondUser = {
                id: 'id-2',
                login: 'testuser',
                display_name: 'Second',
            }
            getTwitchTokenMock.mockResolvedValueOnce('test-token')
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [firstUser, secondUser] }),
            })

            const result = await getTwitchUserByLogin('testuser')

            expect(result).toEqual(firstUser)
        })
    })
})
