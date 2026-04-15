import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import digestCommand from './digest'

const getStatsMock = jest.fn()
const getCasesSinceMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()
const enableMock = jest.fn()
const disableMock = jest.fn()
const markSentMock = jest.fn()
const sendDigestForGuildMock = jest.fn()
const createUserFriendlyErrorMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        getStats: (...args: unknown[]) => getStatsMock(...args),
        getCasesSince: (...args: unknown[]) => getCasesSinceMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    createUserFriendlyError: (...args: unknown[]) =>
        createUserFriendlyErrorMock(...args),
}))

jest.mock('../../../utils/moderation/modDigestConfig', () => ({
    modDigestConfigService: {
        enable: (...args: unknown[]) => enableMock(...args),
        disable: (...args: unknown[]) => disableMock(...args),
        markSent: (...args: unknown[]) => markSentMock(...args),
    },
}))

jest.mock('../../../utils/moderation/modDigestScheduler', () => ({
    modDigestSchedulerService: {
        sendDigestForGuild: (...args: unknown[]) =>
            sendDigestForGuildMock(...args),
    },
}))

function makeCase(type: string, moderatorName: string, daysAgo: number) {
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    return { type, moderatorName, createdAt }
}

type InteractionOverrides = {
    subcommand?: string | null
    period?: string | null
    channel?: any
    guild?: { id: string; name: string } | null
}

function createInteraction(overrides: InteractionOverrides = {}) {
    // Preserve explicit `null` so the missing-subcommand fallback (which the
    // command resolves with `getSubcommand(false) ?? 'view'`) is exercised.
    const subcommand = Object.prototype.hasOwnProperty.call(
        overrides,
        'subcommand',
    )
        ? overrides.subcommand
        : 'view'
    return {
        guild:
            overrides.guild === undefined
                ? { id: '123456789012345678', name: 'TestServer' }
                : overrides.guild,
        user: { tag: 'Admin#0001' },
        options: {
            getSubcommand: jest.fn().mockReturnValue(subcommand),
            getString: jest.fn(() => overrides.period ?? null),
            getChannel: jest.fn(() => overrides.channel ?? null),
        },
        replied: false,
        deferred: false,
    } as any
}

describe('digest command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        interactionReplyMock.mockResolvedValue(undefined)
        infoLogMock.mockReturnValue(undefined)
        errorLogMock.mockReturnValue(undefined)
        createUserFriendlyErrorMock.mockReturnValue('Friendly error')
    })

    it('has correct command name and description', () => {
        const data = digestCommand.data.toJSON()
        expect(data.name).toBe('digest')
        expect(data.description).toContain('digest')
    })

    it('exposes view, schedule, and unschedule subcommands', () => {
        const data = digestCommand.data.toJSON()
        const subNames = (data.options ?? []).map((o: any) => o.name)
        expect(subNames).toEqual(
            expect.arrayContaining(['view', 'schedule', 'unschedule']),
        )
    })

    describe('view subcommand', () => {
        it('replies with embed when cases exist in period', async () => {
            getStatsMock.mockResolvedValue({ totalCases: 10, activeCases: 2 })
            getCasesSinceMock.mockResolvedValue([
                makeCase('WARN', 'Mod1', 3),
                makeCase('BAN', 'Mod2', 5),
            ])

            const interaction = createInteraction({ subcommand: 'view', period: '7d' })
            await digestCommand.execute({ interaction, client: {} as any })

            expect(getStatsMock).toHaveBeenCalledWith('123456789012345678')
            // getCasesSince is called with a Date cutoff derived from `days`,
            // not a hard-coded limit. Verify guildId + that arg 2 is a Date.
            expect(getCasesSinceMock).toHaveBeenCalledTimes(1)
            const [guildArg, sinceArg] = getCasesSinceMock.mock.calls[0]
            expect(guildArg).toBe('123456789012345678')
            expect(sinceArg).toBeInstanceOf(Date)
            expect(interactionReplyMock).toHaveBeenCalledTimes(1)
            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.embeds).toHaveLength(1)
            expect(infoLogMock).toHaveBeenCalledTimes(1)
        })

        it('uses a 7-day cutoff when period is 7d', async () => {
            // The view path now bounds the query by date, not by row count.
            // This test pins the behaviour: cutoff ≈ now - 7 days.
            getStatsMock.mockResolvedValue({ totalCases: 0, activeCases: 0 })
            getCasesSinceMock.mockResolvedValue([])

            const before = Date.now()
            const interaction = createInteraction({
                subcommand: 'view',
                period: '7d',
            })
            await digestCommand.execute({ interaction, client: {} as any })
            const after = Date.now()

            const sinceArg = getCasesSinceMock.mock.calls[0][1] as Date
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
            expect(sinceArg.getTime()).toBeGreaterThanOrEqual(
                before - sevenDaysMs,
            )
            expect(sinceArg.getTime()).toBeLessThanOrEqual(
                after - sevenDaysMs,
            )
        })

        it('defaults to 7d period when no option provided', async () => {
            // Two cases straddle the 7-day boundary: one inside (3d) and one outside (10d).
            // The DB query is mocked to return both; buildDigestEmbed re-filters
            // by days, so a 7d default should count exactly 1 (the 3d case).
            // 30d/90d would count 2 — this test pins the default at 7.
            getStatsMock.mockResolvedValue({ totalCases: 5, activeCases: 0 })
            getCasesSinceMock.mockResolvedValue([
                makeCase('KICK', 'Mod1', 3),
                makeCase('BAN', 'Mod2', 10),
            ])

            const interaction = createInteraction({ subcommand: 'view' })
            await digestCommand.execute({ interaction, client: {} as any })

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            const embed = replyArg.content.embeds[0]
            expect(embed.data?.title).toContain('7 days')
            const fields = embed.data?.fields ?? []
            const actionsField = fields.find((f: any) => f.name.includes('Actions'))
            // "**1** total" — only the 3-day-old case is in window
            expect(actionsField?.value).toContain('**1**')
        })

        it('falls back to view when no subcommand is supplied', async () => {
            getStatsMock.mockResolvedValue({ totalCases: 0, activeCases: 0 })
            getCasesSinceMock.mockResolvedValue([])

            const interaction = createInteraction({ subcommand: null })
            await digestCommand.execute({ interaction, client: {} as any })

            expect(getStatsMock).toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalledTimes(1)
        })

        it('replies with friendly error when service throws', async () => {
            getStatsMock.mockRejectedValue(new Error('DB error'))
            getCasesSinceMock.mockResolvedValue([])

            const interaction = createInteraction({ subcommand: 'view', period: '7d' })
            await digestCommand.execute({ interaction, client: {} as any })

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toBe('Friendly error')
            expect(errorLogMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('schedule subcommand', () => {
        it('sends the sample digest first, then enables with lastSentAt set', async () => {
            const callOrder: string[] = []
            sendDigestForGuildMock.mockImplementation(async () => {
                callOrder.push('send')
                return true
            })
            enableMock.mockImplementation(async () => {
                callOrder.push('enable')
                return {}
            })

            const channel = { id: 'channel-1', type: 0 }
            const interaction = createInteraction({ subcommand: 'schedule', channel })
            await digestCommand.execute({ interaction, client: {} as any })

            expect(callOrder).toEqual(['send', 'enable'])
            expect(sendDigestForGuildMock).toHaveBeenCalledWith(
                '123456789012345678',
                'channel-1',
            )
            const enableArg = enableMock.mock.calls[0][0] as any
            expect(enableArg.guildId).toBe('123456789012345678')
            expect(enableArg.channelId).toBe('channel-1')
            expect(typeof enableArg.lastSentAt).toBe('number')
            // markSent is no longer needed — enable wrote lastSentAt atomically
            expect(markSentMock).not.toHaveBeenCalled()

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toContain('scheduled')
            expect(replyArg.content.content).toContain('sample digest')
        })

        it('still enables (with lastSentAt=null) when the sample digest fails', async () => {
            sendDigestForGuildMock.mockResolvedValue(false)
            enableMock.mockResolvedValue({})

            const channel = { id: 'channel-2', type: 0 }
            const interaction = createInteraction({ subcommand: 'schedule', channel })
            await digestCommand.execute({ interaction, client: {} as any })

            const enableArg = enableMock.mock.calls[0][0] as any
            expect(enableArg.lastSentAt).toBeNull()

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toContain('schedule is active')
        })

        it('rejects non-text channels', async () => {
            const channel = { id: 'voice', type: 2 }
            const interaction = createInteraction({ subcommand: 'schedule', channel })
            await digestCommand.execute({ interaction, client: {} as any })

            expect(enableMock).not.toHaveBeenCalled()
            expect(sendDigestForGuildMock).not.toHaveBeenCalled()
            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toContain('text channel')
        })

        it('replies with friendly error when enable throws', async () => {
            sendDigestForGuildMock.mockResolvedValue(true)
            enableMock.mockRejectedValue(new Error('redis down'))
            const channel = { id: 'channel-1', type: 0 }
            const interaction = createInteraction({ subcommand: 'schedule', channel })

            await digestCommand.execute({ interaction, client: {} as any })

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toBe('Friendly error')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('unschedule subcommand', () => {
        it('confirms removal when config existed', async () => {
            disableMock.mockResolvedValue(true)

            const interaction = createInteraction({ subcommand: 'unschedule' })
            await digestCommand.execute({ interaction, client: {} as any })

            expect(disableMock).toHaveBeenCalledWith('123456789012345678')
            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toContain('disabled')
        })

        it('reports nothing-to-do when config was missing', async () => {
            disableMock.mockResolvedValue(false)

            const interaction = createInteraction({ subcommand: 'unschedule' })
            await digestCommand.execute({ interaction, client: {} as any })

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toContain('No active digest')
        })

        it('replies with friendly error when disable throws', async () => {
            disableMock.mockRejectedValue(new Error('redis down'))
            const interaction = createInteraction({ subcommand: 'unschedule' })

            await digestCommand.execute({ interaction, client: {} as any })

            const replyArg = interactionReplyMock.mock.calls[0][0] as any
            expect(replyArg.content.content).toBe('Friendly error')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    it('replies with error message when not in a guild', async () => {
        const interaction = createInteraction({ subcommand: 'view', guild: null })
        await digestCommand.execute({ interaction, client: {} as any })

        const replyArg = interactionReplyMock.mock.calls[0][0] as any
        expect(replyArg.content.content).toContain('server')
        expect(getStatsMock).not.toHaveBeenCalled()
    })
})
