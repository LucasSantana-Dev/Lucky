import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MessageFlags, PermissionFlagsBits } from 'discord.js'
import type { ButtonInteraction } from 'discord.js'
import type { TFunction } from 'i18next'

type AnyFn = (...args: any[]) => any
const disableRecapMock = jest.fn<AnyFn>()
const errorLogMock = jest.fn()

jest.mock('../../services/recap/recapStore', () => ({
    disableRecap: (...a: unknown[]) => disableRecapMock(...a),
}))
jest.mock('@lucky/shared/utils', () => ({
    errorLog: (...a: unknown[]) => errorLogMock(...a),
    infoLog: jest.fn(),
}))
jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))

import {
    buildRecapOffRow,
    handleRecapOffButton,
    RECAP_OFF_BUTTON_ID,
} from './recapOffButton'

function makeInteraction(canManage: boolean) {
    return {
        customId: RECAP_OFF_BUTTON_ID,
        guildId: 'g-1',
        memberPermissions: {
            has: (perm: bigint) =>
                canManage && perm === PermissionFlagsBits.ManageGuild,
        },
        reply: jest.fn<AnyFn>().mockResolvedValue(undefined),
        deferUpdate: jest.fn<AnyFn>().mockResolvedValue(undefined),
        editReply: jest.fn<AnyFn>().mockResolvedValue(undefined),
        followUp: jest.fn<AnyFn>().mockResolvedValue(undefined),
    }
}

const ephemeral = (content: string) => ({
    content,
    flags: MessageFlags.Ephemeral,
})

describe('recap off button (#2738)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        disableRecapMock.mockResolvedValue(true)
    })

    it('builds one localized button', () => {
        const t = ((key: string) => key) as unknown as TFunction
        expect(buildRecapOffRow(t).toJSON().components).toEqual([
            expect.objectContaining({
                custom_id: RECAP_OFF_BUTTON_ID,
                label: 'music.recap.offButton',
            }),
        ])
    })

    it('turns the recap off and removes the button', async () => {
        const interaction = makeInteraction(true)

        await handleRecapOffButton(interaction as unknown as ButtonInteraction)

        expect(disableRecapMock).toHaveBeenCalledWith('g-1')
        // Acked before the DB call, so a slow write cannot expire the click.
        expect(
            interaction.deferUpdate.mock.invocationCallOrder[0],
        ).toBeLessThan(disableRecapMock.mock.invocationCallOrder[0])
        expect(interaction.editReply).toHaveBeenCalledWith({ components: [] })
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.disabled'),
        )
    })

    it('says so when the recap was already off', async () => {
        disableRecapMock.mockResolvedValue(false)
        const interaction = makeInteraction(true)

        await handleRecapOffButton(interaction as unknown as ButtonInteraction)

        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.alreadyOff'),
        )
    })

    it('refuses members without Manage Server and keeps the button', async () => {
        const interaction = makeInteraction(false)

        await handleRecapOffButton(interaction as unknown as ButtonInteraction)

        expect(interaction.deferUpdate).toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.needManageGuild'),
        )
        expect(disableRecapMock).not.toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('reports a failed write without removing the button', async () => {
        disableRecapMock.mockRejectedValue(new Error('db down'))
        const interaction = makeInteraction(true)

        await handleRecapOffButton(interaction as unknown as ButtonInteraction)

        expect(errorLogMock).toHaveBeenCalled()
        expect(interaction.deferUpdate).toHaveBeenCalled()
        expect(interaction.editReply).not.toHaveBeenCalled()
        expect(interaction.followUp).toHaveBeenCalledWith(
            ephemeral('music.recap.failed'),
        )
    })
})
