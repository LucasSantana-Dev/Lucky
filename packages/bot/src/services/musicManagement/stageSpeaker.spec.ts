import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import type { VoiceState } from 'discord.js'

const debugLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

import { ensureStageSpeaker } from './stageSpeaker'

type BuildOptions = {
    channelType?: ChannelType
    suppress?: boolean
    permissions?: bigint[]
    hasMe?: boolean
    setSuppressed?: () => Promise<void>
    setRequestToSpeak?: () => Promise<void>
}

const buildVoiceState = ({
    channelType = ChannelType.GuildStageVoice,
    suppress = true,
    permissions = [],
    hasMe = true,
    setSuppressed = async () => undefined,
    setRequestToSpeak = async () => undefined,
}: BuildOptions = {}) => {
    const granted = new Set(permissions)
    const setSuppressedMock = jest.fn(setSuppressed)
    const setRequestToSpeakMock = jest.fn(setRequestToSpeak)

    const voice = {
        channel: { type: channelType, id: 'stage-1' },
        suppress,
        guild: {
            id: 'guild-1',
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
        setSuppressed: setSuppressedMock,
        setRequestToSpeak: setRequestToSpeakMock,
    } as unknown as VoiceState

    return { voice, setSuppressedMock, setRequestToSpeakMock }
}

describe('ensureStageSpeaker', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('does nothing on a normal voice channel', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({
                channelType: ChannelType.GuildVoice,
                permissions: [PermissionFlagsBits.MuteMembers],
            })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('not-stage')
        expect(setSuppressedMock).not.toHaveBeenCalled()
        expect(setRequestToSpeakMock).not.toHaveBeenCalled()
    })

    it('does nothing when already unsuppressed on stage', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({
                suppress: false,
                permissions: [PermissionFlagsBits.MuteMembers],
            })

        await expect(ensureStageSpeaker(voice)).resolves.toBe(
            'already-speaking',
        )
        expect(setSuppressedMock).not.toHaveBeenCalled()
        expect(setRequestToSpeakMock).not.toHaveBeenCalled()
    })

    it('unsuppresses itself when it holds MuteMembers', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({
                permissions: [PermissionFlagsBits.MuteMembers],
            })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('unsuppressed')
        expect(setSuppressedMock).toHaveBeenCalledWith(false)
        expect(setRequestToSpeakMock).not.toHaveBeenCalled()
    })

    it('raises a hand when it only holds RequestToSpeak', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({
                permissions: [PermissionFlagsBits.RequestToSpeak],
            })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('requested')
        expect(setSuppressedMock).not.toHaveBeenCalled()
        expect(setRequestToSpeakMock).toHaveBeenCalledWith(true)
    })

    it('falls back to requesting when a permitted unsuppress is rejected', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({
                permissions: [
                    PermissionFlagsBits.MuteMembers,
                    PermissionFlagsBits.RequestToSpeak,
                ],
                setSuppressed: async () => {
                    throw new Error('Missing Permissions')
                },
            })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('requested')
        expect(setSuppressedMock).toHaveBeenCalledWith(false)
        expect(setRequestToSpeakMock).toHaveBeenCalledWith(true)
        expect(debugLogMock).toHaveBeenCalled()
    })

    it('reports blocked when it holds neither permission', async () => {
        const { voice, setSuppressedMock, setRequestToSpeakMock } =
            buildVoiceState({ permissions: [] })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('blocked')
        expect(setSuppressedMock).not.toHaveBeenCalled()
        expect(setRequestToSpeakMock).not.toHaveBeenCalled()
    })

    it('reports failed and warns when the request is rejected', async () => {
        const { voice } = buildVoiceState({
            permissions: [PermissionFlagsBits.RequestToSpeak],
            setRequestToSpeak: async () => {
                throw new Error('Unknown Voice State')
            },
        })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('failed')
        expect(warnLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/request-to-speak failed/i),
            }),
        )
    })

    it('reports failed when the bot member is not cached', async () => {
        const { voice } = buildVoiceState({ hasMe: false })

        await expect(ensureStageSpeaker(voice)).resolves.toBe('failed')
    })
})
