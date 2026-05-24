import { describe, expect, it, jest } from '@jest/globals'
import type { Client, Message } from 'discord.js'
import { Events } from 'discord.js'

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: {
        isEnabled: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

const mockExecute = jest.fn()
const mockRegister = jest.fn().mockReturnThis()

jest.mock('../message/pipeline', () => ({
    MessagePipeline: jest.fn().mockImplementation(() => ({
        register: mockRegister,
        execute: mockExecute,
    })),
}))

jest.mock('../message/autoModHandler', () => ({
    autoModHandler: {},
}))

jest.mock('../message/spamHandler', () => ({
    spamHandler: {},
}))

jest.mock('../message/customCommandHandler', () => ({
    customCommandHandler: {},
}))

jest.mock('../message/xpHandler', () => ({
    xpHandler: {},
}))

import { featureToggleService } from '@lucky/shared/services'
import { errorLog } from '@lucky/shared/utils'
import { handleMessageCreate } from '../messageHandler'

describe('messageHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockExecute.mockClear()
        mockRegister.mockClear()
    })

    describe('handleMessageCreate', () => {
        it('should register Events.MessageCreate listener on client', () => {
            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            expect(mockClient.on).toHaveBeenCalledWith(
                Events.MessageCreate,
                expect.any(Function),
            )
        })

        it('should early return when message.guild is falsy', async () => {
            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: null,
                member: { id: 'member1' },
                author: { id: 'user1' },
            } as unknown as Message

            await callback(mockMessage)

            expect(featureToggleService.isEnabled).not.toHaveBeenCalled()
        })

        it('should early return when message.member is falsy', async () => {
            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: { id: 'guild1' },
                member: null,
                author: { id: 'user1' },
            } as unknown as Message

            await callback(mockMessage)

            expect(featureToggleService.isEnabled).not.toHaveBeenCalled()
        })

        it('should fetch both feature toggles via featureToggleService', async () => {
            ;(featureToggleService.isEnabled as jest.Mock)
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)

            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: { id: 'guild1' },
                member: { id: 'member1' },
                author: { id: 'user1', bot: false },
            } as unknown as Message

            await callback(mockMessage)

            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'AUTOMOD',
                { guildId: 'guild1' },
            )
            expect(featureToggleService.isEnabled).toHaveBeenCalledWith(
                'CUSTOM_COMMANDS',
                { guildId: 'guild1' },
            )
        })

        it('should handle featureToggleService failures gracefully', async () => {
            ;(featureToggleService.isEnabled as jest.Mock)
                .mockRejectedValueOnce(new Error('Service error'))
                .mockResolvedValueOnce(true)

            mockExecute.mockResolvedValueOnce(undefined)

            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: { id: 'guild1' },
                member: { id: 'member1' },
                author: { id: 'user1', bot: false },
            } as unknown as Message

            await callback(mockMessage)

            expect(mockExecute).toHaveBeenCalled()
        })

        it('should call pipeline.execute with correct context', async () => {
            ;(featureToggleService.isEnabled as jest.Mock)
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)

            mockExecute.mockResolvedValueOnce(undefined)

            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: { id: 'guild1' },
                member: { id: 'member1' },
                author: { id: 'user1', bot: false },
            } as unknown as Message

            await callback(mockMessage)

            expect(mockExecute).toHaveBeenCalledWith(
                mockMessage,
                expect.objectContaining({
                    guild: mockMessage.guild,
                    member: mockMessage.member,
                    featureToggles: {
                        AUTOMOD: true,
                        CUSTOM_COMMANDS: false,
                    },
                }),
            )
        })

        it('should call errorLog when an error is thrown inside the handler', async () => {
            ;(featureToggleService.isEnabled as jest.Mock)
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)

            const mockError = new Error('Pipeline error')
            mockExecute.mockRejectedValueOnce(mockError)

            const mockClient = {
                on: jest.fn(),
            } as unknown as Client

            handleMessageCreate(mockClient)

            const callback = (mockClient.on as jest.Mock).mock.calls[0][1]

            const mockMessage = {
                guild: { id: 'guild1' },
                member: { id: 'member1' },
                author: { id: 'user1', bot: false },
            } as unknown as Message

            await callback(mockMessage)

            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Error handling message:',
                    error: mockError,
                }),
            )
        })
    })
})
