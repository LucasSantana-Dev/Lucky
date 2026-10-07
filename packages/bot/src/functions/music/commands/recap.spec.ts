import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type AnyFn = (...args: any[]) => any
const requireGuildMock = jest.fn<AnyFn>()
const interactionReplyMock = jest.fn<AnyFn>()
const enableRecapMock = jest.fn<AnyFn>()
const disableRecapMock = jest.fn<AnyFn>()
const resolveRecapChannelMock = jest.fn<AnyFn>()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...a: unknown[]) => requireGuildMock(...a),
}))
jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...a: unknown[]) => interactionReplyMock(...a),
}))
jest.mock('../../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))
jest.mock('../../../services/recap/recapStore', () => ({
    enableRecap: (...a: unknown[]) => enableRecapMock(...a),
    disableRecap: (...a: unknown[]) => disableRecapMock(...a),
}))
jest.mock('../../../services/recap/recapScheduler', () => ({
    resolveRecapChannel: (...a: unknown[]) => resolveRecapChannelMock(...a),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    infoLog: jest.fn(),
}))

import recapCommand from './recap'

function interaction(sub: 'channel' | 'off', canManage = true) {
    return {
        guildId: 'g-1',
        guild: { id: 'g-1' },
        memberPermissions: { has: () => canManage },
        options: {
            getSubcommand: () => sub,
            getChannel: () => ({ id: 'c-1' }),
        },
    } as any
}

const replied = () => interactionReplyMock.mock.calls[0][0].content.content

describe('recap command (#2678)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
    })

    it('is a music command gated on Manage Server', () => {
        const json = recapCommand.data.toJSON()
        expect(json.name).toBe('recap')
        expect(json.default_member_permissions).toBe('32')
        expect(recapCommand.category).toBe('music')
    })

    it('enables the recap in a channel the bot can post in', async () => {
        resolveRecapChannelMock.mockResolvedValue({ channel: { id: 'c-1' } })

        await recapCommand.execute({
            interaction: interaction('channel'),
        } as any)

        expect(enableRecapMock).toHaveBeenCalledWith(
            'g-1',
            'c-1',
            expect.any(Date),
        )
        expect(replied()).toBe('music.recap.enabled')
    })

    it.each([
        ['missing_channel', 'music.recap.notTextChannel'],
        ['missing_permissions', 'music.recap.missingPermissions'],
    ])('refuses on %s without saving', async (reason, key) => {
        resolveRecapChannelMock.mockResolvedValue({ reason })

        await recapCommand.execute({
            interaction: interaction('channel'),
        } as any)

        expect(enableRecapMock).not.toHaveBeenCalled()
        expect(replied()).toBe(key)
    })

    it.each([
        [true, 'music.recap.disabled'],
        [false, 'music.recap.alreadyOff'],
    ])('off when opted in=%s replies %s', async (wasOn, key) => {
        disableRecapMock.mockResolvedValue(wasOn)

        await recapCommand.execute({ interaction: interaction('off') } as any)

        expect(disableRecapMock).toHaveBeenCalledWith('g-1')
        expect(replied()).toBe(key)
    })

    it('replies with a generic error when storage fails', async () => {
        disableRecapMock.mockRejectedValue(new Error('db'))

        await recapCommand.execute({ interaction: interaction('off') } as any)

        expect(replied()).toBe('music.recap.failed')
    })

    it('re-checks Manage Server at runtime, since role overrides can bypass the default', async () => {
        await recapCommand.execute({
            interaction: interaction('off', false),
        } as any)

        expect(disableRecapMock).not.toHaveBeenCalled()
        expect(replied()).toBe('music.recap.needManageGuild')
    })

    it('replies ephemerally', async () => {
        disableRecapMock.mockResolvedValue(true)

        await recapCommand.execute({ interaction: interaction('off') } as any)

        expect(interactionReplyMock.mock.calls[0][0].content.ephemeral).toBe(
            true,
        )
    })

    it('does nothing outside a guild', async () => {
        requireGuildMock.mockResolvedValue(false)

        await recapCommand.execute({ interaction: interaction('off') } as any)

        expect(disableRecapMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).not.toHaveBeenCalled()
    })
})
