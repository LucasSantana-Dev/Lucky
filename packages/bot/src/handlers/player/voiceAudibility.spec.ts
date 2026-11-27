import { ChannelType, PermissionFlagsBits } from 'discord.js'

const debugLogMock = jest.fn()
const infoLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('../../utils/general/embeds', () => ({
    createWarningEmbed: (title: string, body: string) => ({ title, body }),
}))

import { ensureAudible, setupVoiceAudibilityCheck } from './voiceAudibility'

type StateOptions = {
    channelType?: ChannelType | null
    channelId?: string | null
    serverMute?: boolean
    permissions?: bigint[]
    hasMe?: boolean
    memberId?: string
    setMute?: () => Promise<void>
}

const buildState = ({
    channelType = ChannelType.GuildVoice,
    channelId = 'voice-1',
    serverMute = false,
    permissions = [PermissionFlagsBits.Speak],
    hasMe = true,
    memberId = 'bot-user-id',
    setMute = async () => undefined,
}: StateOptions = {}) => {
    const granted = new Set(permissions)
    const setMuteMock = jest.fn(setMute)
    const state = {
        member: { id: memberId },
        channelId,
        channel:
            channelType === null || channelId === null
                ? null
                : { type: channelType, id: channelId },
        serverMute,
        guild: {
            id: 'guild-1',
            name: 'Test Guild',
            members: {
                me: hasMe
                    ? {
                          permissionsIn: () => ({
                              has: (flag: bigint) => granted.has(flag),
                          }),
                      }
                    : null,
            },
        },
        setMute: setMuteMock,
    }
    return { state: state as any, setMuteMock }
}

describe('ensureAudible', () => {
    beforeEach(() => jest.clearAllMocks())

    it('leaves stage channels to the stage handler', async () => {
        const { state } = buildState({
            channelType: ChannelType.GuildStageVoice,
            permissions: [],
        })
        await expect(ensureAudible(state)).resolves.toBe('not-applicable')
    })

    it('is not applicable without a cached bot member', async () => {
        const { state } = buildState({ hasMe: false })
        await expect(ensureAudible(state)).resolves.toBe('not-applicable')
    })

    it('reports a channel that denies Speak', async () => {
        const { state } = buildState({ permissions: [] })
        await expect(ensureAudible(state)).resolves.toBe('no-speak')
    })

    it('is audible with Speak and no server mute', async () => {
        const { state, setMuteMock } = buildState()
        await expect(ensureAudible(state)).resolves.toBe('audible')
        expect(setMuteMock).not.toHaveBeenCalled()
    })

    it('removes its own server mute when it holds Mute Members', async () => {
        const { state, setMuteMock } = buildState({
            serverMute: true,
            permissions: [
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.MuteMembers,
            ],
        })
        await expect(ensureAudible(state)).resolves.toBe('unmuted')
        expect(setMuteMock).toHaveBeenCalledWith(false)
    })

    it('reports server-muted when the unmute is rejected', async () => {
        const { state } = buildState({
            serverMute: true,
            permissions: [
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.MuteMembers,
            ],
            setMute: async () => {
                throw new Error('Missing Permissions')
            },
        })
        await expect(ensureAudible(state)).resolves.toBe('server-muted-locked')
        expect(debugLogMock).toHaveBeenCalled()
    })

    it('lifts the mute even when Speak is denied', async () => {
        const { state, setMuteMock } = buildState({
            serverMute: true,
            permissions: [PermissionFlagsBits.MuteMembers],
        })
        await expect(ensureAudible(state)).resolves.toBe('no-speak')
        expect(setMuteMock).toHaveBeenCalledWith(false)
    })

    it('reports both causes when it can neither speak nor unmute', async () => {
        const { state } = buildState({ serverMute: true, permissions: [] })
        await expect(ensureAudible(state)).resolves.toBe('no-speak-muted')
    })

    it('reports server-muted without Mute Members', async () => {
        const { state, setMuteMock } = buildState({ serverMute: true })
        await expect(ensureAudible(state)).resolves.toBe('server-muted')
        expect(setMuteMock).not.toHaveBeenCalled()
    })
})

describe('setupVoiceAudibilityCheck', () => {
    const buildClient = (send = jest.fn(async () => undefined)) => {
        const listeners: Array<(o: any, n: any) => Promise<void>> = []
        const queue = {
            guild: { id: 'guild-1' },
            metadata: { channel: { send } },
        }
        const client = {
            user: { id: 'bot-user-id' },
            player: { nodes: { get: jest.fn(() => queue) } },
            on: jest.fn((event: string, handler: any) => {
                if (event === 'voiceStateUpdate') listeners.push(handler)
            }),
        }
        setupVoiceAudibilityCheck(client as any)
        return { listeners, send }
    }

    beforeEach(() => jest.clearAllMocks())

    it('ignores other members', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ memberId: 'someone', permissions: [] })
        await listeners[0]({ channelId: null, serverMute: false }, state)
        expect(send).not.toHaveBeenCalled()
    })

    it('tells the channel when it joins without Speak', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ permissions: [] })
        await listeners[0]({ channelId: null, serverMute: false }, state)
        expect(send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    title: "🔇 I can't be heard in this channel",
                    body: expect.stringContaining('Allow **Speak**'),
                }),
            ],
        })
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'voice: bot cannot be heard (no-speak)',
            }),
        )
    })

    it('tells the channel when a moderator server-mutes it mid-session', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ serverMute: true })
        await listeners[0]({ channelId: 'voice-1', serverMute: false }, state)
        expect(send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    title: "🔇 I'm server-muted",
                    body: expect.stringContaining('give me **Mute Members**'),
                }),
            ],
        })
    })

    it('checks the new channel when moved between voice channels', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ channelId: 'voice-2', permissions: [] })
        await listeners[0]({ channelId: 'voice-1', serverMute: false }, state)
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ channelId: 'voice-2' }),
            }),
        )
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('stays quiet on unrelated updates in the same channel', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ permissions: [] })
        await listeners[0]({ channelId: 'voice-1', serverMute: false }, state)
        expect(send).not.toHaveBeenCalled()
    })

    it('stays quiet when it fixed the mute itself', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({
            serverMute: true,
            permissions: [
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.MuteMembers,
            ],
        })
        await listeners[0]({ channelId: null, serverMute: false }, state)
        expect(send).not.toHaveBeenCalled()
        expect(infoLogMock).toHaveBeenCalled()
    })

    it('ignores a disconnect', async () => {
        const { listeners, send } = buildClient()
        const { state } = buildState({ channelId: null })
        await listeners[0]({ channelId: 'voice-1', serverMute: false }, state)
        expect(send).not.toHaveBeenCalled()
    })
})
