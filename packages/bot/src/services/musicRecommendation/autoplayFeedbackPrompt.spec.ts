import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'

const setFeedbackMock = jest.fn<(...args: unknown[]) => Promise<boolean>>()
const getLikedMock = jest.fn<(...args: unknown[]) => Promise<Set<string>>>()
const getDislikedMock = jest.fn<(...args: unknown[]) => Promise<Set<string>>>()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('./feedbackService', () => ({
    recommendationFeedbackService: {
        setFeedback: (...args: unknown[]) => setFeedbackMock(...args),
        getLikedTrackKeys: (...args: unknown[]) => getLikedMock(...args),
        getDislikedTrackKeys: (...args: unknown[]) => getDislikedMock(...args),
        buildTrackKey: (title: string, author: string) =>
            `${title.toLowerCase()}::${author.toLowerCase()}`,
    },
}))

jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction:
        async () => (key: string, options?: { title?: string }) =>
            options?.title === undefined ? key : `${key}|${options.title}`,
}))

import {
    AUTOPLAY_FEEDBACK_BUTTON_PREFIX,
    captureAutoplayTrack,
    handleAutoplayFeedbackButton,
    maybePromptAutoplayFeedback,
    resetAutoplayFeedbackPromptState,
} from './autoplayFeedbackPrompt'

const autoplayTrack = {
    title: 'Pick',
    author: 'Artist',
    metadata: { isAutoplay: true },
}

function promptInteraction(userId = 'user-1', guildId: string | null = 'g-1') {
    return {
        guildId,
        user: { id: userId, username: `name-${userId}` },
        followUp: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    }
}

async function sendPrompt(userId = 'user-1', trackTitle = 'Pick') {
    const interaction = promptInteraction(userId)
    const snapshot = captureAutoplayTrack({
        ...autoplayTrack,
        title: trackTitle,
    })
    await maybePromptAutoplayFeedback(interaction as never, snapshot)
    return interaction
}

function keyFrom(interaction: { followUp: jest.Mock }): string {
    const payload = interaction.followUp.mock.calls[0][0] as {
        components: { toJSON: () => { components: { custom_id: string }[] } }[]
    }
    return payload.components[0].toJSON().components[0].custom_id.split(':')[2]
}

function buttonInteraction(feedback: string, key: string, userId = 'user-1') {
    return {
        customId: `${AUTOPLAY_FEEDBACK_BUTTON_PREFIX}${feedback}:${key}`,
        guildId: 'g-1',
        user: { id: userId, username: `name-${userId}` },
        reply: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    }
}

describe('autoplay feedback prompt', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        resetAutoplayFeedbackPromptState()
        setFeedbackMock.mockResolvedValue(true)
        getLikedMock.mockResolvedValue(new Set())
        getDislikedMock.mockResolvedValue(new Set())
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('captureAutoplayTrack', () => {
        it('captures only autoplay tracks', () => {
            expect(captureAutoplayTrack(autoplayTrack)).toEqual({
                trackKey: 'pick::artist',
                title: 'Pick',
            })
            expect(
                captureAutoplayTrack({ title: 'Pick', author: 'Artist' }),
            ).toBeNull()
            expect(
                captureAutoplayTrack({
                    title: 'Pick',
                    author: 'Artist',
                    metadata: { isAutoplay: false },
                }),
            ).toBeNull()
            expect(captureAutoplayTrack(null)).toBeNull()
        })

        it('skips a track whose key normalizes to nothing', () => {
            expect(
                captureAutoplayTrack({
                    ...autoplayTrack,
                    title: '',
                    author: '',
                }),
            ).toBeNull()
        })
    })

    describe('maybePromptAutoplayFeedback', () => {
        it('sends one ephemeral follow-up with two buttons to the actor', async () => {
            const interaction = await sendPrompt()

            expect(interaction.followUp).toHaveBeenCalledTimes(1)
            const payload = interaction.followUp.mock.calls[0][0] as any
            expect(payload.ephemeral).toBe(true)
            expect(payload.content).toBe('music.autoplayFeedback.prompt')
            expect(payload.allowedMentions).toEqual({ parse: [] })
            const ids = payload.components[0]
                .toJSON()
                .components.map((c: { custom_id: string }) => c.custom_id)
            expect(ids).toHaveLength(2)
            expect(ids[0]).toMatch(/^autoplay_fb:like:[0-9a-f]{8}$/)
            expect(ids[1]).toMatch(/^autoplay_fb:dislike:[0-9a-f]{8}$/)
        })

        it('does nothing without a snapshot (not an autoplay track)', async () => {
            const interaction = promptInteraction()

            await maybePromptAutoplayFeedback(interaction as never, null)

            expect(interaction.followUp).not.toHaveBeenCalled()
        })

        it('does nothing outside a guild', async () => {
            const interaction = promptInteraction('user-1', null)

            await maybePromptAutoplayFeedback(
                interaction as never,
                captureAutoplayTrack(autoplayTrack),
            )

            expect(interaction.followUp).not.toHaveBeenCalled()
        })

        it('prompts at most once per user per guild per 10 minutes', async () => {
            jest.useFakeTimers({ now: 1_000_000 })

            const first = await sendPrompt('user-1', 'Song A')
            const second = await sendPrompt('user-1', 'Song B')
            const otherUser = await sendPrompt('user-2', 'Song B')

            expect(first.followUp).toHaveBeenCalledTimes(1)
            expect(second.followUp).not.toHaveBeenCalled()
            expect(otherUser.followUp).toHaveBeenCalledTimes(1)

            jest.setSystemTime(1_000_000 + 10 * 60 * 1000 + 1)
            const later = await sendPrompt('user-1', 'Song C')
            expect(later.followUp).toHaveBeenCalledTimes(1)
        })

        it('does not ask twice when two actions race past the cooldown', async () => {
            const a = promptInteraction()
            const b = promptInteraction()
            const snapshot = captureAutoplayTrack(autoplayTrack)

            await Promise.all([
                maybePromptAutoplayFeedback(a as never, snapshot),
                maybePromptAutoplayFeedback(b as never, snapshot),
            ])

            expect(
                a.followUp.mock.calls.length + b.followUp.mock.calls.length,
            ).toBe(1)
        })

        it.each([
            ['liked', getLikedMock],
            ['disliked', getDislikedMock],
        ])('skips a track the user already %s', async (_label, mock) => {
            mock.mockResolvedValue(new Set(['pick::artist']))

            const interaction = await sendPrompt()

            expect(interaction.followUp).not.toHaveBeenCalled()
        })

        it('swallows a failing follow-up and logs it', async () => {
            const interaction = promptInteraction()
            interaction.followUp.mockRejectedValue(new Error('discord down'))

            await expect(
                maybePromptAutoplayFeedback(
                    interaction as never,
                    captureAutoplayTrack(autoplayTrack),
                ),
            ).resolves.toBeUndefined()

            expect(errorLogMock).toHaveBeenCalledTimes(1)
        })

        it('swallows a failing vote lookup', async () => {
            getLikedMock.mockRejectedValue(new Error('db down'))

            const interaction = await sendPrompt()

            expect(interaction.followUp).not.toHaveBeenCalled()
            expect(errorLogMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('handleAutoplayFeedbackButton', () => {
        it.each(['like', 'dislike'] as const)(
            'stores %s for the skipped track, not the current one',
            async (feedback) => {
                const prompt = await sendPrompt('user-1', 'Skipped Song')
                const click = buttonInteraction(feedback, keyFrom(prompt))

                await handleAutoplayFeedbackButton(click as never)

                expect(setFeedbackMock).toHaveBeenCalledWith(
                    'g-1',
                    'user-1',
                    'name-user-1',
                    'skipped song::artist',
                    feedback,
                )
                expect(click.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        content: expect.stringContaining('Skipped Song'),
                        components: [],
                    }),
                )
            },
        )

        it('rejects a click from another user and stores nothing', async () => {
            const prompt = await sendPrompt('user-1')
            const click = buttonInteraction('like', keyFrom(prompt), 'user-2')

            await handleAutoplayFeedbackButton(click as never)

            expect(setFeedbackMock).not.toHaveBeenCalled()
            expect(click.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'music.autoplayFeedback.notForYou',
                    ephemeral: true,
                }),
            )
        })

        it('answers "expired" for an unknown key', async () => {
            const click = buttonInteraction('like', 'deadbeef')

            await handleAutoplayFeedbackButton(click as never)

            expect(setFeedbackMock).not.toHaveBeenCalled()
            expect(click.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'music.autoplayFeedback.expired',
                    ephemeral: true,
                }),
            )
        })

        it('answers "expired" once the 30 minute key lifetime has passed', async () => {
            jest.useFakeTimers({ now: 5_000_000 })
            const prompt = await sendPrompt()
            const key = keyFrom(prompt)

            jest.setSystemTime(5_000_000 + 30 * 60 * 1000 + 1)
            const click = buttonInteraction('like', key)
            await handleAutoplayFeedbackButton(click as never)

            expect(setFeedbackMock).not.toHaveBeenCalled()
            expect(click.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'music.autoplayFeedback.expired',
                }),
            )
        })

        it('counts an answer once: a second click finds the key used up', async () => {
            const prompt = await sendPrompt()
            const key = keyFrom(prompt)

            await handleAutoplayFeedbackButton(
                buttonInteraction('like', key) as never,
            )
            const second = buttonInteraction('dislike', key)
            await handleAutoplayFeedbackButton(second as never)

            expect(setFeedbackMock).toHaveBeenCalledTimes(1)
            expect(second.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'music.autoplayFeedback.expired',
                }),
            )
        })

        it('keeps the key and reports a failed save so the user can retry', async () => {
            const prompt = await sendPrompt()
            const key = keyFrom(prompt)
            setFeedbackMock.mockResolvedValueOnce(false)

            const failed = buttonInteraction('like', key)
            await handleAutoplayFeedbackButton(failed as never)
            expect(failed.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: 'music.autoplayFeedback.failed',
                }),
            )

            const retry = buttonInteraction('like', key)
            await handleAutoplayFeedbackButton(retry as never)
            expect(retry.update).toHaveBeenCalled()
        })

        it('rejects a malformed custom id', async () => {
            const click = buttonInteraction('meh', 'abc')

            await handleAutoplayFeedbackButton(click as never)

            expect(setFeedbackMock).not.toHaveBeenCalled()
            expect(click.reply).toHaveBeenCalled()
        })
    })
})
