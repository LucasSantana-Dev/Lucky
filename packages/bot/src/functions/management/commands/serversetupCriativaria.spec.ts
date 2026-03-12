import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

const autoMessageService = {
    createMessage: jest.fn(),
    updateMessage: jest.fn(),
    upsertGuildTypeMessage: jest.fn(),
}

const autoModService = {
    updateSettings: jest.fn(),
}

const customCommandService = {
    getCommand: jest.fn(),
    createCommand: jest.fn(),
    updateCommand: jest.fn(),
    upsertCommand: jest.fn(),
}

const embedBuilderService = {
    getTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    upsertTemplate: jest.fn(),
}

const guildSettingsService = {
    setGuildSettings: jest.fn(),
}

const moderationService = {
    updateSettings: jest.fn(),
}

const roleManagementService = {
    setExclusiveRole: jest.fn(),
}

const twitchNotificationService = {
    add: jest.fn(),
}

const getPrismaClientMock = jest.fn()
const getTwitchUserByLoginMock = jest.fn()
const refreshTwitchSubscriptionsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    autoMessageService,
    autoModService,
    customCommandService,
    embedBuilderService,
    guildSettingsService,
    moderationService,
    roleManagementService,
    twitchNotificationService,
}))

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: getPrismaClientMock,
}))

jest.mock('../../../twitch/twitchApi', () => ({
    getTwitchUserByLogin: getTwitchUserByLoginMock,
}))

jest.mock('../../../twitch', () => ({
    refreshTwitchSubscriptions: refreshTwitchSubscriptionsMock,
}))

import {
    formatCriativariaSummary,
    runCriativariaSetup,
    resolveSetupMode,
    upsertCustomCommand,
    upsertEmbedTemplate,
    CRIATIVARIA_CHANNEL_IDS,
} from './serversetupCriativaria'

const ALL_ROLE_IDS = new Set<string>([
    '998010383858143324',
    '897229914170851358',
    '1460788103722701010',
    '1458512270555480075',
    '1458210431435935758',
    '1460803423082512520',
    '1458206157574377522',
    '1458206091367420138',
    '1458205784134389931',
])

const ENV_KEYS = [
    'LASTFM_API_KEY',
    'LASTFM_API_SECRET',
    'LASTFM_LINK_SECRET',
    'WEBAPP_SESSION_SECRET',
] as const

const ORIGINAL_ENV = {
    LASTFM_API_KEY: process.env.LASTFM_API_KEY,
    LASTFM_API_SECRET: process.env.LASTFM_API_SECRET,
    LASTFM_LINK_SECRET: process.env.LASTFM_LINK_SECRET,
    WEBAPP_SESSION_SECRET: process.env.WEBAPP_SESSION_SECRET,
}

type MockGuildOptions = {
    channelMap?: Map<string, unknown>
    roleIds?: Set<string>
}

function createMockGuild(options: MockGuildOptions = {}) {
    const channelMap = options.channelMap ?? new Map<string, unknown>()
    const roleIds = options.roleIds ?? new Set<string>()

    return {
        id: '895505900016631839',
        name: 'Criativaria',
        ownerId: 'owner-1',
        iconURL: jest.fn(() => null),
        setIcon: jest.fn().mockResolvedValue(undefined),
        setSplash: jest.fn().mockResolvedValue(undefined),
        setBanner: jest.fn().mockResolvedValue(undefined),
        edit: jest.fn().mockResolvedValue(undefined),
        channels: {
            cache: {
                get: jest.fn((channelId: string) => channelMap.get(channelId) ?? null),
            },
        },
        roles: {
            cache: {
                has: jest.fn((roleId: string) => roleIds.has(roleId)),
            },
        },
    } as any
}

function createBaseChannelMap(options?: {
    staffAssets?: unknown
    modLog?: unknown
    twitchLive?: unknown
}) {
    return new Map<string, unknown>([
        [
            CRIATIVARIA_CHANNEL_IDS.welcome,
            { id: CRIATIVARIA_CHANNEL_IDS.welcome, name: 'welcome' },
        ],
        [
            CRIATIVARIA_CHANNEL_IDS.leaveLog,
            { id: CRIATIVARIA_CHANNEL_IDS.leaveLog, name: 'leave-log' },
        ],
        [
            CRIATIVARIA_CHANNEL_IDS.twitchLive,
            options?.twitchLive ?? {
                id: CRIATIVARIA_CHANNEL_IDS.twitchLive,
                name: 'twitch-live',
            },
        ],
        [
            CRIATIVARIA_CHANNEL_IDS.botCommands,
            { id: CRIATIVARIA_CHANNEL_IDS.botCommands, name: 'bot-commands' },
        ],
        [
            CRIATIVARIA_CHANNEL_IDS.modLog,
            options?.modLog ?? { id: CRIATIVARIA_CHANNEL_IDS.modLog, name: 'mod-log' },
        ],
        [
            CRIATIVARIA_CHANNEL_IDS.staffAssets,
            options?.staffAssets ?? {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
            },
        ],
    ])
}

function createPrismaMock(options?: {
    guildUpsert?: jest.Mock
}) {
    const guildUpsert = options?.guildUpsert
        ?? jest.fn().mockResolvedValue({ id: 'guild-record' })

    getPrismaClientMock.mockReturnValue({
        guild: {
            upsert: guildUpsert,
        },
    })

    return {
        guildUpsert,
    }
}

describe('serversetupCriativaria helpers', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()

        autoMessageService.createMessage.mockResolvedValue(undefined)
        autoMessageService.updateMessage.mockResolvedValue(undefined)
        autoMessageService.upsertGuildTypeMessage.mockResolvedValue('updated')
        autoModService.updateSettings.mockResolvedValue(undefined)
        customCommandService.getCommand.mockResolvedValue(null)
        customCommandService.createCommand.mockResolvedValue(undefined)
        customCommandService.updateCommand.mockResolvedValue(undefined)
        customCommandService.upsertCommand.mockResolvedValue('updated')
        embedBuilderService.getTemplate.mockResolvedValue(null)
        embedBuilderService.createTemplate.mockResolvedValue(undefined)
        embedBuilderService.updateTemplate.mockResolvedValue(undefined)
        embedBuilderService.upsertTemplate.mockResolvedValue('updated')
        guildSettingsService.setGuildSettings.mockResolvedValue(undefined)
        moderationService.updateSettings.mockResolvedValue(undefined)
        roleManagementService.setExclusiveRole.mockResolvedValue(undefined)
        twitchNotificationService.add.mockResolvedValue(true)

        createPrismaMock()
        getTwitchUserByLoginMock.mockResolvedValue(null)
        refreshTwitchSubscriptionsMock.mockResolvedValue(undefined)

        process.env.LASTFM_API_KEY = 'key'
        process.env.LASTFM_API_SECRET = 'secret'
        process.env.LASTFM_LINK_SECRET = 'link'
        delete process.env.WEBAPP_SESSION_SECRET
    })

    afterEach(() => {
        for (const key of ENV_KEYS) {
            const original = ORIGINAL_ENV[key]
            if (original === undefined) {
                delete process.env[key]
                continue
            }
            process.env[key] = original
        }
    })

    it('resolves setup mode with apply fallback', () => {
        expect(resolveSetupMode('dry-run')).toBe('dry-run')
        expect(resolveSetupMode('apply')).toBe('apply')
        expect(resolveSetupMode(null)).toBe('apply')
        expect(resolveSetupMode('unexpected')).toBe('apply')
    })

    it('formats dry-run summary header', () => {
        const output = formatCriativariaSummary(
            {
                applied: ['item 1'],
                unchanged: [],
                warnings: ['warn 1'],
            },
            'dry-run',
        )

        expect(output).toContain('Criativaria setup (dry-run)')
        expect(output).toContain('item 1')
        expect(output).toContain('warn 1')
    })

    it('formats apply summary with empty sections', () => {
        const output = formatCriativariaSummary(
            {
                applied: [],
                unchanged: [],
                warnings: [],
            },
            'apply',
        )

        expect(output).toContain('Criativaria setup aplicado')
        expect(output).toContain('Aplicado/Planejado\n- nenhum item')
    })

    it('upserts custom commands without creating duplicates', async () => {
        customCommandService.upsertCommand
            .mockResolvedValueOnce('created')
            .mockResolvedValueOnce('updated')

        const seed = {
            name: 'regras',
            description: 'desc',
            response: 'resp',
        } as any

        const first = await upsertCustomCommand('guild-1', seed)
        const second = await upsertCustomCommand('guild-1', seed)

        expect(first).toBe('created')
        expect(second).toBe('updated')
        expect(customCommandService.upsertCommand).toHaveBeenCalledTimes(2)
    })

    it('upserts embed templates without creating duplicates', async () => {
        embedBuilderService.upsertTemplate
            .mockResolvedValueOnce('created')
            .mockResolvedValueOnce('updated')

        const seed = {
            name: 'boas-vindas',
            title: 't',
            description: 'd',
            footer: 'f',
        } as any

        const first = await upsertEmbedTemplate(
            'guild-1',
            seed,
            'https://cdn.discordapp.com/a.png',
        )
        const second = await upsertEmbedTemplate(
            'guild-1',
            seed,
            'https://cdn.discordapp.com/a.png',
        )

        expect(first).toBe('created')
        expect(second).toBe('updated')
        expect(embedBuilderService.upsertTemplate).toHaveBeenCalledTimes(2)
    })

    it('does not mutate guild visuals during apply', async () => {
        const guild = createMockGuild()
        const result = await runCriativariaSetup(guild, 'apply')

        expect(guild.setIcon).not.toHaveBeenCalled()
        expect(guild.setSplash).not.toHaveBeenCalled()
        expect(guild.setBanner).not.toHaveBeenCalled()
        expect(guild.edit).not.toHaveBeenCalledWith(
            expect.objectContaining({
                icon: expect.anything(),
            }),
        )
        expect(guild.edit).not.toHaveBeenCalledWith(
            expect.objectContaining({
                splash: expect.anything(),
            }),
        )
        expect(guild.edit).not.toHaveBeenCalledWith(
            expect.objectContaining({
                banner: expect.anything(),
            }),
        )
        expect(result.applied).toContain(
            'Perfil visual do servidor preservado (sem mudanças de ícone/splash/banner).',
        )
    })

    it('does not use guild splash fallback when upload is unavailable', async () => {
        const guild = createMockGuild()
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.unchanged).not.toContain(
            'Usando splash CDN como fallback da imagem dos templates.',
        )
    })

    it('uploads static criativaria banner asset for templates', async () => {
        const sendMock = jest.fn().mockResolvedValue({
            attachments: {
                first: () => ({ url: 'https://cdn.discordapp.com/attachments/banner.png' }),
            },
        })

        const channelMap = createBaseChannelMap({
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: sendMock,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        await runCriativariaSetup(guild, 'apply')

        const files = sendMock.mock.calls[0]?.[0]?.files as string[] | undefined
        expect(files?.[0]).toContain('criativaria-banner.png')
    })

    it('runs dry-run with full template matrix and no mutations', async () => {
        const modSend = jest.fn().mockResolvedValue(undefined)
        const staffSend = jest.fn().mockResolvedValue(undefined)
        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: modSend,
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'dry-run')

        expect(result.applied).toEqual(
            expect.arrayContaining([
                'Planejado: aplicar configurações de moderação.',
                'Planejado: aplicar automod balanceado (spam/caps/links/invites/words).',
                'Planejado: aplicar baseline de configurações de guilda.',
                'Planejado: configurar auto-mensagens de entrada e saída em PT-BR.',
                'Planejado: upsert de templates de embed (boas-vindas/regras/suporte).',
                'Planejado: upsert de custom commands (regras/cargos/links/suporte).',
                'Planejado: aplicar exclusividade Senior/Pleno/Junior.',
                'Planejado: seed Twitch para login criativaria no canal de live.',
            ]),
        )
        expect(moderationService.updateSettings).not.toHaveBeenCalled()
        expect(autoModService.updateSettings).not.toHaveBeenCalled()
        expect(guildSettingsService.setGuildSettings).not.toHaveBeenCalled()
        expect(autoMessageService.createMessage).not.toHaveBeenCalled()
        expect(autoMessageService.upsertGuildTypeMessage).not.toHaveBeenCalled()
        expect(embedBuilderService.createTemplate).not.toHaveBeenCalled()
        expect(embedBuilderService.upsertTemplate).not.toHaveBeenCalled()
        expect(customCommandService.createCommand).not.toHaveBeenCalled()
        expect(customCommandService.upsertCommand).not.toHaveBeenCalled()
        expect(roleManagementService.setExclusiveRole).not.toHaveBeenCalled()
        expect(twitchNotificationService.add).not.toHaveBeenCalled()
        expect(modSend).not.toHaveBeenCalled()
        expect(staffSend).not.toHaveBeenCalled()
    })

    it('configures automod with scheme-agnostic phishing patterns', async () => {
        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: jest.fn().mockResolvedValue(undefined),
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: jest.fn().mockResolvedValue({
                    attachments: {
                        first: () => ({
                            url: 'https://cdn.discordapp.com/attachments/banner.png',
                        }),
                    },
                }),
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        await runCriativariaSetup(guild, 'apply')

        const payload = autoModService.updateSettings.mock.calls[0]?.[1]
        expect(payload?.bannedWords).toContain('discord-gift')
        expect(
            payload?.bannedWords.some((word: string) => word.includes('://discord-gift')),
        ).toBe(false)
    })

    it('captures step failures and continues subsequent setup actions', async () => {
        moderationService.updateSettings.mockRejectedValueOnce(new Error('moderation-down'))

        const modSend = jest.fn().mockResolvedValue(undefined)
        const staffSend = jest.fn().mockResolvedValue({
            attachments: {
                first: () => ({ url: 'https://cdn.discordapp.com/attachments/banner.png' }),
            },
        })

        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: modSend,
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                'Configuração de moderação: moderation-down',
                'Twitch seed falhou: usuário criativaria não encontrado na API Twitch.',
            ]),
        )
        expect(autoModService.updateSettings).toHaveBeenCalledTimes(1)
        expect(guildSettingsService.setGuildSettings).toHaveBeenCalledTimes(1)
        expect(customCommandService.upsertCommand).toHaveBeenCalled()
        expect(modSend).toHaveBeenCalledTimes(1)
    })

    it('reuses cached image, upserts auto-messages, and logs apply summary', async () => {
        const modSend = jest.fn().mockResolvedValue(undefined)
        const staffSend = jest.fn().mockResolvedValue(undefined)

        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: modSend,
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        embedBuilderService.getTemplate
            .mockResolvedValueOnce({
                image: 'https://cdn.discordapp.com/attachments/cached-banner.png',
            } as any)
            .mockResolvedValue(null)

        const guildUpsert = jest.fn().mockResolvedValue({ id: 'guild-db-id' })
        createPrismaMock({ guildUpsert })

        autoMessageService.upsertGuildTypeMessage
            .mockResolvedValueOnce('created')
            .mockResolvedValueOnce('updated')

        getTwitchUserByLoginMock.mockResolvedValue({ id: 'tw-id', login: 'criativaria' })
        twitchNotificationService.add.mockResolvedValue(true)
        refreshTwitchSubscriptionsMock.mockRejectedValue(new Error('refresh-failed'))

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(staffSend).not.toHaveBeenCalled()
        expect(result.unchanged).toContain('Imagem CDN existente reutilizada para templates.')
        expect(autoMessageService.upsertGuildTypeMessage).toHaveBeenCalledTimes(2)
        expect(guildUpsert).toHaveBeenCalledTimes(1)
        expect(twitchNotificationService.add).toHaveBeenCalledWith(
            'guild-db-id',
            CRIATIVARIA_CHANNEL_IDS.twitchLive,
            'tw-id',
            'criativaria',
        )
        expect(refreshTwitchSubscriptionsMock).toHaveBeenCalledTimes(1)
        expect(result.warnings).toContain(
            'Twitch seed aplicado, mas refresh de subscriptions falhou.',
        )
        expect(result.applied).toContain('Notificação Twitch para criativaria configurada.')
        expect(modSend).toHaveBeenCalledWith(
            expect.objectContaining({
                embeds: expect.any(Array),
            }),
        )
    })

    it('warns when mod/staff channels exist but do not support send', async () => {
        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                'Canal de log da moderação não permite envio de mensagem.',
                'Canal de assets da equipe não permite envio de mensagem.',
                'Sem canal de assets disponível para upload da imagem estática da Criativaria.',
            ]),
        )
    })

    it('warns when upload response lacks a CDN asset URL', async () => {
        const staffSend = jest.fn().mockResolvedValue({
            attachments: {
                first: () => undefined,
            },
        })

        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: jest.fn().mockResolvedValue(undefined),
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.warnings).toContain(
            'Upload da imagem estática da Criativaria não retornou URL válida.',
        )
    })

    it('warns when static asset upload throws an exception', async () => {
        const staffSend = jest.fn().mockRejectedValue(new Error('upload-failed'))

        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: jest.fn().mockResolvedValue(undefined),
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.warnings).toContain(
            'Falha no upload da imagem estática da Criativaria '
            + '(continuando sem imagem CDN): upload-failed',
        )
    })

    it('warns when static asset file is unavailable before upload', async () => {
        const originalCwd = process.cwd()
        process.chdir('/tmp')

        const staffSend = jest.fn().mockResolvedValue(undefined)
        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: jest.fn().mockResolvedValue(undefined),
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: staffSend,
            },
        })

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        try {
            const result = await runCriativariaSetup(guild, 'apply')

            expect(result.warnings).toContain(
                'Arquivo de imagem estática da Criativaria não encontrado: assets/criativaria-banner.png',
            )
            expect(staffSend).not.toHaveBeenCalled()
        } finally {
            process.chdir(originalCwd)
        }
    })

    it('warns when twitch seed is not persisted', async () => {
        const channelMap = createBaseChannelMap({
            modLog: {
                id: CRIATIVARIA_CHANNEL_IDS.modLog,
                name: 'mod-log',
                send: jest.fn().mockResolvedValue(undefined),
            },
            staffAssets: {
                id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                name: 'staff-assets',
                send: jest.fn().mockResolvedValue({
                    attachments: {
                        first: () => ({
                            url: 'https://cdn.discordapp.com/attachments/banner.png',
                        }),
                    },
                }),
            },
        })

        const guildUpsert = jest.fn().mockResolvedValue({ id: 'guild-db-id' })
        createPrismaMock({ guildUpsert })
        getTwitchUserByLoginMock.mockResolvedValue({ id: 'tw-id', login: 'criativaria' })
        twitchNotificationService.add.mockResolvedValue(false)

        const guild = createMockGuild({ channelMap, roleIds: ALL_ROLE_IDS })
        const result = await runCriativariaSetup(guild, 'apply')

        expect(guildUpsert).toHaveBeenCalledTimes(1)
        expect(result.warnings).toContain(
            'Twitch seed falhou: não foi possível salvar notificação.',
        )
        expect(refreshTwitchSubscriptionsMock).not.toHaveBeenCalled()
    })
})
