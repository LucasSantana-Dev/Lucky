import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const getConfigMock = jest.fn()
const getMemberXPMock = jest.fn()
const addXPMock = jest.fn()
const getRewardsMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    levelService: {
        getConfig: (...args: unknown[]) => getConfigMock(...args),
        getMemberXP: (...args: unknown[]) => getMemberXPMock(...args),
        addXP: (...args: unknown[]) => addXPMock(...args),
        getRewards: (...args: unknown[]) => getRewardsMock(...args),
    },
    autoModService: {
        getSettings: jest.fn().mockResolvedValue(null),
    },
    customCommandService: {
        findMatchingResponder: jest.fn().mockResolvedValue(null),
        getCommand: jest.fn().mockResolvedValue(null),
    },
    featureToggleService: {
        isEnabled: jest.fn().mockResolvedValue(false),
    },
    moderationService: {},
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: jest.fn(),
    infoLog: jest.fn(),
}))

import { handleMessageCreate } from './messageHandler'

function makeClient(channelOverrides: any = {}) {
    const handlers: Record<string, Function> = {}
    const fetchedChannel = {
        isTextBased: () => true,
        send: jest.fn().mockResolvedValue(undefined),
        ...channelOverrides,
    }
    return {
        on: jest.fn((event: string, fn: Function) => {
            handlers[event] = fn
        }),
        channels: {
            fetch: jest.fn().mockResolvedValue(fetchedChannel),
        },
        _handlers: handlers,
        _channel: fetchedChannel,
    }
}

function makeMessage(overrides: any = {}) {
    return {
        guild: { id: 'guild-1' },
        author: {
            id: 'user-1',
            bot: false,
            toString: () => '<@user-1>',
        },
        member: {
            roles: {
                add: jest.fn().mockResolvedValue(undefined),
            },
        },
        client: makeClient(),
        channelId: 'ch-1',
        ...overrides,
    }
}

const ACTIVE_CONFIG = {
    enabled: true,
    xpPerMessage: 10,
    xpCooldownMs: 5000,
    announceChannel: null as string | null,
}

describe('handleMessageCreate — XP handling', () => {
    let client: ReturnType<typeof makeClient>

    beforeEach(() => {
        jest.clearAllMocks()
        client = makeClient()
        handleMessageCreate(client as any)
    })

    it('does nothing when message is from a bot', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        const message = makeMessage({
            author: { id: 'bot-1', bot: true, toString: () => '<@bot-1>' },
        })
        await client._handlers['messageCreate'](message)
        expect(getConfigMock).not.toHaveBeenCalled()
    })

    it('does nothing when message has no guild', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        const message = makeMessage({ guild: null })
        await client._handlers['messageCreate'](message)
        expect(getConfigMock).not.toHaveBeenCalled()
    })

    it('does nothing when level config is null', async () => {
        getConfigMock.mockResolvedValue(null)
        getMemberXPMock.mockResolvedValue(null)
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(addXPMock).not.toHaveBeenCalled()
    })

    it('does nothing when level config is disabled', async () => {
        getConfigMock.mockResolvedValue({ ...ACTIVE_CONFIG, enabled: false })
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(addXPMock).not.toHaveBeenCalled()
    })

    it('does nothing when user is on cooldown', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        getMemberXPMock.mockResolvedValue({
            lastXpAt: new Date(Date.now() - 100),
        })
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(addXPMock).not.toHaveBeenCalled()
    })

    it('adds XP when cooldown has elapsed', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        getMemberXPMock.mockResolvedValue({
            lastXpAt: new Date(Date.now() - 10000),
        })
        addXPMock.mockResolvedValue({ leveledUp: false, newLevel: 1 })
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(addXPMock).toHaveBeenCalledWith('guild-1', 'user-1', 10)
    })

    it('adds XP when user has no prior XP record', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        getMemberXPMock.mockResolvedValue(null)
        addXPMock.mockResolvedValue({ leveledUp: false, newLevel: 1 })
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(addXPMock).toHaveBeenCalledWith('guild-1', 'user-1', 10)
    })

    it('announces level up when channel configured and user leveled up', async () => {
        const sendMock = jest.fn().mockResolvedValue(undefined)
        const fetchedChannel = { isTextBased: () => true, send: sendMock }
        client = makeClient(fetchedChannel)
        handleMessageCreate(client as any)
        getConfigMock.mockResolvedValue({
            ...ACTIVE_CONFIG,
            announceChannel: 'announce-ch',
        })
        getMemberXPMock.mockResolvedValue(null)
        addXPMock.mockResolvedValue({ leveledUp: true, newLevel: 5 })
        getRewardsMock.mockResolvedValue([])
        const message = makeMessage({
            client: {
                channels: {
                    fetch: jest.fn().mockResolvedValue(fetchedChannel),
                },
            },
        })
        await client._handlers['messageCreate'](message)
        expect(sendMock).toHaveBeenCalledWith(
            expect.stringContaining('level **5**'),
        )
    })

    it('assigns role reward when available for the reached level', async () => {
        getConfigMock.mockResolvedValue({
            ...ACTIVE_CONFIG,
            announceChannel: 'announce-ch',
        })
        getMemberXPMock.mockResolvedValue(null)
        addXPMock.mockResolvedValue({ leveledUp: true, newLevel: 5 })
        getRewardsMock.mockResolvedValue([{ level: 5, roleId: 'role-5' }])
        const addRoleMock = jest.fn().mockResolvedValue(undefined)
        const sendMock = jest.fn().mockResolvedValue(undefined)
        const message = makeMessage({
            member: { roles: { add: addRoleMock } },
            client: {
                channels: {
                    fetch: jest
                        .fn()
                        .mockResolvedValue({
                            isTextBased: () => true,
                            send: sendMock,
                        }),
                },
            },
        })
        await client._handlers['messageCreate'](message)
        expect(addRoleMock).toHaveBeenCalledWith('role-5')
    })

    it('logs error when XP handler throws', async () => {
        getConfigMock.mockRejectedValue(new Error('db error'))
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(errorLogMock).toHaveBeenCalled()
    })

    it('logs error when addXP throws', async () => {
        getConfigMock.mockResolvedValue(ACTIVE_CONFIG)
        getMemberXPMock.mockResolvedValue(null)
        addXPMock.mockRejectedValue(new Error('addXP failed'))
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error handling XP:' }),
        )
    })

    it('logs error when getRewards throws after level-up', async () => {
        getConfigMock.mockResolvedValue({
            ...ACTIVE_CONFIG,
            announceChannel: 'ch',
        })
        getMemberXPMock.mockResolvedValue(null)
        addXPMock.mockResolvedValue({ leveledUp: true, newLevel: 3 })
        getRewardsMock.mockRejectedValue(new Error('rewards db error'))
        const message = makeMessage()
        await client._handlers['messageCreate'](message)
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Error handling XP:' }),
        )
    })
})
