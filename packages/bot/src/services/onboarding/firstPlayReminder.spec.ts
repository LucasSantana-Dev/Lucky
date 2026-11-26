import { ChannelType } from 'discord.js'

const prisma = {
    activationEvent: { findMany: jest.fn(), findFirst: jest.fn() },
    trackHistory: { findFirst: jest.fn() },
}
const recordActivationEventMock = jest.fn()
const findOnboardingChannelMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => prisma,
    infoLog: (...a: unknown[]) => infoLogMock(...a),
    errorLog: (...a: unknown[]) => errorLogMock(...a),
}))
jest.mock('@lucky/shared/services', () => ({
    recordActivationEvent: (...a: unknown[]) => recordActivationEventMock(...a),
}))
jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: async () => (key: string) => key,
}))
jest.mock('../../handlers/onboardingStation', () => {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } =
        jest.requireActual('discord.js')
    return {
        createOnboardingStationRow: async () =>
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('station_play')
                    .setLabel('play')
                    .setStyle(ButtonStyle.Primary),
            ),
    }
})
jest.mock('../../handlers/onboardingChannel', () => ({
    findOnboardingChannel: (...a: unknown[]) => findOnboardingChannelMock(...a),
}))

import {
    FirstPlayReminderScheduler,
    REMINDER_AFTER_MS,
    REMINDER_UNTIL_MS,
} from './firstPlayReminder'

const NOW = new Date('2026-11-26T12:00:00.000Z')

function setup({ inCache = true }: { inCache?: boolean } = {}) {
    const send = jest.fn().mockResolvedValue(undefined)
    const channel = { type: ChannelType.GuildText, send }
    findOnboardingChannelMock.mockReturnValue(channel)
    const guild = { id: 'guild-1' }
    const client = {
        guilds: {
            cache: {
                get: (id: string) =>
                    inCache && id === guild.id ? guild : undefined,
            },
        },
    }
    const scheduler = new FirstPlayReminderScheduler({ clock: () => NOW })
    ;(scheduler as unknown as { client: unknown }).client = client
    return { scheduler, send, guild }
}

describe('first-play reminder', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        prisma.activationEvent.findMany.mockResolvedValue([
            { guildDiscordId: 'guild-1' },
        ])
        prisma.activationEvent.findFirst.mockResolvedValue(null)
        prisma.trackHistory.findFirst.mockResolvedValue(null)
        recordActivationEventMock.mockResolvedValue(true)
    })

    it('looks at guilds welcomed between one and three days ago', async () => {
        const { scheduler } = setup()

        await scheduler.tick()

        expect(prisma.activationEvent.findMany).toHaveBeenCalledWith({
            where: {
                kind: 'onboarding_delivered',
                occurredAt: {
                    gte: new Date(NOW.getTime() - REMINDER_UNTIL_MS),
                    lte: new Date(NOW.getTime() - REMINDER_AFTER_MS),
                },
            },
            select: { guildDiscordId: true },
            distinct: ['guildDiscordId'],
        })
    })

    it('reminds a guild that never played, recording it before the send', async () => {
        const { scheduler, send } = setup()

        await scheduler.tick()

        expect(recordActivationEventMock).toHaveBeenCalledWith(
            'guild-1',
            'first_play_reminder',
        )
        expect(prisma.activationEvent.findFirst).toHaveBeenCalledWith({
            where: { guildDiscordId: 'guild-1', kind: 'first_play_reminder' },
            select: { id: true },
        })
        expect(prisma.trackHistory.findFirst).toHaveBeenCalledWith({
            where: { guildId: 'guild-1' },
            select: { id: true },
        })
        expect(send).toHaveBeenCalledTimes(1)
        expect(
            recordActivationEventMock.mock.invocationCallOrder[0],
        ).toBeLessThan(send.mock.invocationCallOrder[0])
        const message = send.mock.calls[0][0]
        expect(message.allowedMentions).toEqual({ parse: [] })
        expect(message.embeds[0].toJSON()).toEqual(
            expect.objectContaining({
                title: 'music.onboarding.reminderTitle',
                description: 'music.onboarding.reminderDescription',
            }),
        )
        expect(message.components[0].toJSON().components[0].custom_id).toBe(
            'station_play',
        )
    })

    it('never reminds twice', async () => {
        prisma.activationEvent.findFirst.mockResolvedValue({ id: 1 })
        const { scheduler, send } = setup()

        await scheduler.tick()

        expect(send).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('leaves a guild that already played alone', async () => {
        prisma.trackHistory.findFirst.mockResolvedValue({ id: 'th-1' })
        const { scheduler, send } = setup()

        await scheduler.tick()

        expect(send).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('skips a guild the bot is no longer in', async () => {
        const { scheduler, send } = setup({ inCache: false })

        await scheduler.tick()

        expect(send).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('skips a guild with no channel it can post in', async () => {
        const { scheduler, send } = setup()
        findOnboardingChannelMock.mockReturnValue(null)

        await scheduler.tick()

        expect(send).not.toHaveBeenCalled()
        expect(recordActivationEventMock).not.toHaveBeenCalled()
    })

    it('sends nothing when the reminder could not be recorded', async () => {
        recordActivationEventMock.mockResolvedValue(false)
        const { scheduler, send } = setup()

        await scheduler.tick()

        expect(send).not.toHaveBeenCalled()
    })

    it('logs a failed send and does not throw', async () => {
        const { scheduler, send } = setup()
        send.mockRejectedValue(new Error('network'))

        await expect(scheduler.tick()).resolves.toBeUndefined()

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'first-play reminder: failed',
            }),
        )
    })
})
