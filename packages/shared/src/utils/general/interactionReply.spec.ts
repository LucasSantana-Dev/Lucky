import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const errorLogMock = jest.fn()
const debugLogMock = jest.fn()
const errorEmbedMock = jest.fn()
const infoEmbedMock = jest.fn()

jest.mock('./log.js', () => ({
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    debugLog: (...args: unknown[]) => debugLogMock(...args),
}))

jest.mock('./embeds.js', () => ({
    errorEmbed: (...args: unknown[]) => errorEmbedMock(...args),
    infoEmbed: (...args: unknown[]) => infoEmbedMock(...args),
}))

import { interactionReply } from './interactionReply.js'

function makeChatInputInteraction(overrides: Record<string, unknown> = {}) {
    return {
        isChatInputCommand: jest.fn(() => true),
        isButton: jest.fn(() => false),
        isModalSubmit: jest.fn(() => false),
        isStringSelectMenu: jest.fn(() => false),
        isUserSelectMenu: jest.fn(() => false),
        isChannelSelectMenu: jest.fn(() => false),
        isRoleSelectMenu: jest.fn(() => false),
        isMentionableSelectMenu: jest.fn(() => false),
        deferReply: jest.fn(async () => {}),
        editReply: jest.fn(async () => {}),
        followUp: jest.fn(async () => {}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any
}

function makeButtonInteraction(overrides: Record<string, unknown> = {}) {
    return {
        isChatInputCommand: jest.fn(() => false),
        isButton: jest.fn(() => true),
        isModalSubmit: jest.fn(() => false),
        isStringSelectMenu: jest.fn(() => false),
        isUserSelectMenu: jest.fn(() => false),
        isChannelSelectMenu: jest.fn(() => false),
        isRoleSelectMenu: jest.fn(() => false),
        isMentionableSelectMenu: jest.fn(() => false),
        deferReply: jest.fn(async () => {}),
        editReply: jest.fn(async () => {}),
        followUp: jest.fn(async () => {}),
        replied: false,
        deferred: false,
        ...overrides,
    } as any
}

function makeNonReplyableInteraction() {
    return {
        isChatInputCommand: jest.fn(() => false),
        isButton: jest.fn(() => false),
        isModalSubmit: jest.fn(() => false),
        isStringSelectMenu: jest.fn(() => false),
        isUserSelectMenu: jest.fn(() => false),
        isChannelSelectMenu: jest.fn(() => false),
        isRoleSelectMenu: jest.fn(() => false),
        isMentionableSelectMenu: jest.fn(() => false),
    } as any
}

const fakeEmbed = { toJSON: () => ({ title: 'fake' }) }

describe('interactionReply', () => {
    beforeEach(() => {
        errorEmbedMock.mockReturnValue(fakeEmbed)
        infoEmbedMock.mockReturnValue(fakeEmbed)
    })

    describe('non-replyable interaction', () => {
        it('calls debugLog and returns without replying', async () => {
            const interaction = makeNonReplyableInteraction()
            await interactionReply({ interaction, content: { embeds: [] } })
            expect(debugLogMock).toHaveBeenCalled()
        })
    })

    describe('ChatInputCommandInteraction', () => {
        it('defers and editReplys when not deferred and not replied', async () => {
            const interaction = makeChatInputInteraction()
            await interactionReply({
                interaction,
                content: { embeds: [], ephemeral: true },
            })
            expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
            expect(interaction.editReply).toHaveBeenCalled()
            expect(interaction.followUp).not.toHaveBeenCalled()
        })

        it('does not defer when already deferred', async () => {
            const interaction = makeChatInputInteraction({ deferred: true })
            await interactionReply({
                interaction,
                content: { embeds: [] },
            })
            expect(interaction.deferReply).not.toHaveBeenCalled()
            expect(interaction.editReply).toHaveBeenCalled()
        })

        it('calls followUp when already replied', async () => {
            const interaction = makeChatInputInteraction({
                replied: true,
                deferred: true,
            })
            await interactionReply({
                interaction,
                content: { embeds: [] },
            })
            expect(interaction.followUp).toHaveBeenCalled()
            expect(interaction.editReply).not.toHaveBeenCalled()
        })

        it('passes non-ephemeral undefined flags to deferReply', async () => {
            const interaction = makeChatInputInteraction()
            await interactionReply({
                interaction,
                content: { embeds: [] },
            })
            expect(interaction.deferReply).toHaveBeenCalledWith({
                flags: undefined,
            })
        })
    })

    describe('button interaction', () => {
        it('defers and editReplys when not deferred', async () => {
            const interaction = makeButtonInteraction()
            await interactionReply({
                interaction,
                content: { embeds: [] },
            })
            expect(interaction.deferReply).toHaveBeenCalled()
            expect(interaction.editReply).toHaveBeenCalled()
        })

        it('calls followUp when already replied', async () => {
            const interaction = makeButtonInteraction({
                replied: true,
                deferred: true,
            })
            await interactionReply({
                interaction,
                content: { embeds: [] },
            })
            expect(interaction.followUp).toHaveBeenCalled()
        })
    })

    describe('text-to-embed conversion', () => {
        it('converts text containing "erro" to errorEmbed', async () => {
            const interaction = makeChatInputInteraction()
            await interactionReply({
                interaction,
                content: { content: 'Ocorreu um erro inesperado.' },
            })
            expect(errorEmbedMock).toHaveBeenCalled()
            expect(infoEmbedMock).not.toHaveBeenCalled()
        })

        it('converts plain text without "erro" to infoEmbed', async () => {
            const interaction = makeChatInputInteraction()
            await interactionReply({
                interaction,
                content: { content: 'Tudo certo!' },
            })
            expect(infoEmbedMock).toHaveBeenCalled()
            expect(errorEmbedMock).not.toHaveBeenCalled()
        })

        it('does not convert when embeds are already provided', async () => {
            const interaction = makeChatInputInteraction()
            await interactionReply({
                interaction,
                content: {
                    content: 'mensagem',
                    embeds: [{ title: 'existing' }],
                },
            })
            expect(errorEmbedMock).not.toHaveBeenCalled()
            expect(infoEmbedMock).not.toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        it('catches reply errors and calls errorLog without rethrowing', async () => {
            const interaction = makeChatInputInteraction()
            interaction.deferReply = jest.fn(async () => { throw new Error('network error') })
            await expect(
                interactionReply({ interaction, content: { embeds: [] } }),
            ).resolves.toBeUndefined()
            expect(errorLogMock).toHaveBeenCalled()
        })
    })
})
