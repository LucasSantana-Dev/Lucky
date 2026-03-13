import type { GuildAutomationManifestDocument } from '@lucky/shared/services'

export function buildCriativariaPreset(
    guildId: string,
): GuildAutomationManifestDocument {
    return {
        version: 1,
        guild: {
            id: guildId,
            name: 'Criativaria',
        },
        moderation: {
            automod: {
                enabled: true,
                spamEnabled: true,
                linksEnabled: true,
                invitesEnabled: true,
                wordsEnabled: true,
            },
            moderationSettings: {
                warnThreshold: 3,
                muteDurationMinutes: 30,
            },
        },
        automessages: {
            welcome: {
                enabled: true,
                message:
                    'Bem-vindo(a) ao servidor! Leia as regras e aproveite a comunidade.',
            },
            leave: {
                enabled: true,
                message: 'Ate logo! Esperamos voce de volta em breve.',
            },
        },
        parity: {
            shadowMode: false,
            externalBots: [
                { id: '155149108183695360', name: 'Dyno' },
                { id: '204255221017214977', name: 'MEE6' },
                { id: '270904126974590976', name: 'Carl-bot' },
            ],
            checklist: [
                {
                    key: 'commands-migrated',
                    label: 'Comandos principais migrados para Lucky',
                    done: false,
                },
                {
                    key: 'automod-parity',
                    label: 'Regras de automod alinhadas com o setup legado',
                    done: false,
                },
                {
                    key: 'welcome-flow',
                    label: 'Fluxo de boas-vindas e onboarding validado',
                    done: false,
                },
            ],
            cutoverReady: false,
        },
        source: 'manual',
        capturedAt: new Date().toISOString(),
    }
}
