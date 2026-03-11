import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const customCommandService = {
    getCommand: jest.fn(),
    createCommand: jest.fn(),
    updateCommand: jest.fn(),
}

const embedBuilderService = {
    getTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
}

jest.mock('@lucky/shared/services', () => ({
    autoMessageService: {
        createMessage: jest.fn(),
        updateMessage: jest.fn(),
    },
    autoModService: {
        updateSettings: jest.fn(),
    },
    customCommandService,
    embedBuilderService,
    guildSettingsService: {
        setGuildSettings: jest.fn(),
    },
    moderationService: {
        updateSettings: jest.fn(),
    },
    roleManagementService: {
        setExclusiveRole: jest.fn(),
    },
    twitchNotificationService: {
        add: jest.fn(),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: jest.fn(),
}))

jest.mock('../../../twitch/twitchApi', () => ({
    getTwitchUserByLogin: jest.fn(),
}))

jest.mock('../../../twitch', () => ({
    refreshTwitchSubscriptions: jest.fn(),
}))

import {
    formatCriativariaSummary,
    runCriativariaSetup,
    resolveSetupMode,
    upsertCustomCommand,
    upsertEmbedTemplate,
    CRIATIVARIA_CHANNEL_IDS,
} from './serversetupCriativaria'

type MockGuildOptions = {
    channelMap?: Map<string, unknown>
    features?: string[]
}

function createMockGuild(options: MockGuildOptions = {}) {
    const channelMap = options.channelMap ?? new Map<string, unknown>()
    return {
        id: '895505900016631839',
        name: 'Criativaria',
        ownerId: 'owner-1',
        features: options.features ?? ['INVITE_SPLASH', 'BANNER'],
        iconURL: jest.fn(() => null),
        splashURL: jest.fn(
            () =>
                'https://cdn.discordapp.com/splashes/895505900016631839/example.png',
        ),
        setIcon: jest.fn().mockResolvedValue(undefined),
        setSplash: jest.fn().mockResolvedValue(undefined),
        setBanner: jest.fn().mockResolvedValue(undefined),
        channels: {
            cache: {
                get: jest.fn(
                    (channelId: string) => channelMap.get(channelId) ?? null,
                ),
            },
        },
        roles: {
            cache: {
                has: jest.fn(() => false),
            },
        },
    } as any
}

describe('serversetupCriativaria helpers', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        customCommandService.getCommand.mockReset()
        customCommandService.createCommand.mockReset()
        customCommandService.updateCommand.mockReset()
        embedBuilderService.getTemplate.mockReset()
        embedBuilderService.createTemplate.mockReset()
        embedBuilderService.updateTemplate.mockReset()
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

    it('upserts custom commands without creating duplicates', async () => {
        customCommandService.getCommand
            .mockResolvedValueOnce(null as any)
            .mockResolvedValueOnce({ id: 'existing' } as any)
        customCommandService.createCommand.mockResolvedValue({} as any)
        customCommandService.updateCommand.mockResolvedValue({} as any)

        const seed = {
            name: 'regras',
            description: 'desc',
            response: 'resp',
        } as any

        const first = await upsertCustomCommand('guild-1', seed)
        const second = await upsertCustomCommand('guild-1', seed)

        expect(first).toBe('created')
        expect(second).toBe('updated')
        expect(customCommandService.getCommand).toHaveBeenCalledTimes(2)
        expect(customCommandService.createCommand).toHaveBeenCalledTimes(1)
        expect(customCommandService.updateCommand).toHaveBeenCalledTimes(1)
    })

    it('upserts embed templates without creating duplicates', async () => {
        embedBuilderService.getTemplate
            .mockResolvedValueOnce(null as any)
            .mockResolvedValueOnce({ id: 'existing-template' } as any)
        embedBuilderService.createTemplate.mockResolvedValue({} as any)
        embedBuilderService.updateTemplate.mockResolvedValue({} as any)

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
        expect(embedBuilderService.getTemplate).toHaveBeenCalledTimes(2)
        expect(embedBuilderService.createTemplate).toHaveBeenCalledTimes(1)
        expect(embedBuilderService.updateTemplate).toHaveBeenCalledTimes(1)
    })

    it('does not mutate guild visuals during apply', async () => {
        embedBuilderService.getTemplate.mockResolvedValue(null as any)
        customCommandService.getCommand.mockResolvedValue(null as any)

        const guild = createMockGuild()
        const result = await runCriativariaSetup(guild, 'apply')

        expect(guild.setIcon).not.toHaveBeenCalled()
        expect(guild.setSplash).not.toHaveBeenCalled()
        expect(guild.setBanner).not.toHaveBeenCalled()
        expect(result.applied).toContain(
            'Perfil visual do servidor preservado (sem mudanças de ícone/splash/banner).',
        )
    })

    it('does not use guild splash fallback when upload is unavailable', async () => {
        embedBuilderService.getTemplate.mockResolvedValue(null as any)
        customCommandService.getCommand.mockResolvedValue(null as any)

        const guild = createMockGuild()
        const result = await runCriativariaSetup(guild, 'apply')

        expect(result.unchanged).not.toContain(
            'Usando splash CDN como fallback da imagem dos templates.',
        )
    })

    it('uploads static criativaria banner asset for templates', async () => {
        const bannerPath = resolve(
            process.cwd(),
            'assets/criativaria-banner.png',
        )
        const hadBanner = existsSync(bannerPath)
        if (!hadBanner) {
            await mkdir(dirname(bannerPath), { recursive: true })
            await writeFile(bannerPath, 'test-banner')
        }

        const sendMock = jest.fn().mockResolvedValue({
            attachments: {
                first: () => ({
                    url: 'https://cdn.discordapp.com/attachments/banner.png',
                }),
            },
        })
        const channelMap = new Map<string, unknown>([
            [
                CRIATIVARIA_CHANNEL_IDS.staffAssets,
                {
                    id: CRIATIVARIA_CHANNEL_IDS.staffAssets,
                    name: 'staff-assets',
                    send: sendMock,
                },
            ],
        ])
        embedBuilderService.getTemplate.mockResolvedValue(null as any)
        customCommandService.getCommand.mockResolvedValue(null as any)

        const guild = createMockGuild({ channelMap })
        try {
            await runCriativariaSetup(guild, 'apply')
        } finally {
            if (!hadBanner) {
                await rm(bannerPath)
            }
        }

        const files = sendMock.mock.calls[0]?.[0]?.files as string[] | undefined
        expect(files?.[0]).toContain('criativaria-banner.png')
    })
})
