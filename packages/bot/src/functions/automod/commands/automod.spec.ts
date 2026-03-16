import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import automodCommand from './automod'

const getSettingsMock = jest.fn()
const updateSettingsMock = jest.fn()
const listTemplatesMock = jest.fn()
const applyTemplateMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoModService: {
        getSettings: (...args: unknown[]) => getSettingsMock(...args),
        updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
        listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
        applyTemplate: (...args: unknown[]) => applyTemplateMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createInteraction(subcommand: string, options: Record<string, unknown> = {}) {
    return {
        guild: { id: '123456789012345678', name: 'TestServer' },
        user: { tag: 'Admin#0001' },
        options: {
            getSubcommand: jest.fn(() => subcommand),
            getBoolean: jest.fn((name: string) => options[name] ?? null),
            getString: jest.fn((name: string) => options[name] ?? null),
            getInteger: jest.fn((name: string) => options[name] ?? null),
        },
        replied: false,
        deferred: false,
    } as any
}

const baseSettings = {
    enabled: true,
    spamEnabled: true,
    spamThreshold: 6,
    spamTimeWindow: 8,
    capsEnabled: true,
    capsThreshold: 75,
    linksEnabled: true,
    allowedDomains: ['youtube.com'],
    invitesEnabled: true,
    wordsEnabled: true,
    bannedWords: ['badword'],
    exemptChannels: [],
    exemptRoles: [],
}

describe('automod command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        infoLogMock.mockReturnValue(undefined)
        errorLogMock.mockReturnValue(undefined)
    })

    it('has correct command name and description', () => {
        const data = automodCommand.data.toJSON()
        expect(data.name).toBe('automod')
        expect(data.description).toContain('auto-moderation')
    })

    it('rejects when not in a guild', async () => {
        const interaction = createInteraction('preset')
        interaction.guild = null
        await automodCommand.execute({ interaction, client: {} as any })
        expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        const reply = interactionReplyMock.mock.calls[0][0] as any
        expect(reply.content.content).toContain('server')
    })

    describe('status subcommand', () => {
        it('shows status embed when settings exist', async () => {
            getSettingsMock.mockResolvedValue(baseSettings)
            const interaction = createInteraction('status')
            await automodCommand.execute({ interaction, client: {} as any })
            expect(getSettingsMock).toHaveBeenCalledWith('123456789012345678')
            const reply = interactionReplyMock.mock.calls[0][0] as any
            expect(reply.content.embeds).toHaveLength(1)
        })

        it('reports when no settings exist', async () => {
            getSettingsMock.mockResolvedValue(null)
            const interaction = createInteraction('status')
            await automodCommand.execute({ interaction, client: {} as any })
            const reply = interactionReplyMock.mock.calls[0][0] as any
            expect(reply.content.content).toBeDefined()
        })
    })

    describe('preset subcommand — list', () => {
        it('lists presets when no name given', async () => {
            listTemplatesMock.mockResolvedValue([
                { id: 'balanced', name: 'Balanced', description: 'Balanced baseline.' },
                { id: 'strict', name: 'Strict Shield', description: 'Aggressive.' },
                { id: 'light', name: 'Light', description: 'Low friction.' },
            ])
            const interaction = createInteraction('preset', { name: null })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(listTemplatesMock).toHaveBeenCalledTimes(1)
            const reply = interactionReplyMock.mock.calls[0][0] as any
            expect(reply.content.embeds).toHaveLength(1)
        })
    })

    describe('preset subcommand — apply', () => {
        it('applies a preset and shows result embed', async () => {
            applyTemplateMock.mockResolvedValue({
                settings: { ...baseSettings, spamThreshold: 4 },
                template: { id: 'strict', name: 'Strict Shield', description: 'Aggressive.' },
            })
            const interaction = createInteraction('preset', { name: 'strict' })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(applyTemplateMock).toHaveBeenCalledWith('123456789012345678', 'strict')
            const reply = interactionReplyMock.mock.calls[0][0] as any
            expect(reply.content.embeds).toHaveLength(1)
            expect(infoLogMock).toHaveBeenCalledTimes(1)
        })

        it('calls errorLog on service failure', async () => {
            applyTemplateMock.mockRejectedValue(new Error('DB error'))
            const interaction = createInteraction('preset', { name: 'balanced' })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(errorLogMock).toHaveBeenCalledTimes(1)
            const reply = interactionReplyMock.mock.calls[0][0] as any
            expect(reply.content.content).toContain('Failed')
        })
    })

    describe('module toggle subcommands', () => {
        it('enables spam with threshold and timewindow', async () => {
            updateSettingsMock.mockResolvedValue(baseSettings)
            const interaction = createInteraction('spam', { enabled: true, threshold: 4, timewindow: 5 })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(updateSettingsMock).toHaveBeenCalledWith('123456789012345678', {
                spamEnabled: true,
                spamThreshold: 4,
                spamTimeWindow: 5,
            })
        })

        it('disables caps', async () => {
            updateSettingsMock.mockResolvedValue({ ...baseSettings, capsEnabled: false })
            const interaction = createInteraction('caps', { enabled: false })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(updateSettingsMock).toHaveBeenCalledWith('123456789012345678', { capsEnabled: false })
        })

        it('enables links', async () => {
            updateSettingsMock.mockResolvedValue(baseSettings)
            const interaction = createInteraction('links', { enabled: true })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(updateSettingsMock).toHaveBeenCalledWith('123456789012345678', { linksEnabled: true })
        })

        it('enables invites', async () => {
            updateSettingsMock.mockResolvedValue(baseSettings)
            const interaction = createInteraction('invites', { enabled: true })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(updateSettingsMock).toHaveBeenCalledWith('123456789012345678', { invitesEnabled: true })
        })

        it('enables words', async () => {
            updateSettingsMock.mockResolvedValue(baseSettings)
            const interaction = createInteraction('words', { enabled: true })
            await automodCommand.execute({ interaction, client: {} as any })
            expect(updateSettingsMock).toHaveBeenCalledWith('123456789012345678', { wordsEnabled: true })
        })
    })
})
