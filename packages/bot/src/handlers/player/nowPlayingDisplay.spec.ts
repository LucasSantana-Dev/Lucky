const mockWarnLog = jest.fn()
const mockDebugLog = jest.fn()
const mockTranslatorForInteraction = jest.fn()
const mockCreateNowPlayingButtons = jest.fn()
const mockGetAutoplayCount = jest.fn()
const mockGetAcceptanceRates = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: mockDebugLog,
    errorLog: jest.fn(),
    warnLog: mockWarnLog,
    infoLog: jest.fn(),
    successLog: jest.fn(),
}))

jest.mock('@lucky/shared/config', () => ({
    constants: {
        MAX_AUTOPLAY_TRACKS: 50,
    },
}))

jest.mock('../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: (...args: unknown[]) =>
        mockTranslatorForInteraction(...args),
}))

jest.mock('../../utils/music/autoplayManager', () => ({
    getAutoplayCount: (...args: unknown[]) => mockGetAutoplayCount(...args),
}))

jest.mock('../../utils/music/buttonComponents', () => ({
    createNowPlayingButtons: (...args: unknown[]) =>
        mockCreateNowPlayingButtons(...args),
}))

jest.mock(
    '../../services/musicRecommendation/autoplay/autoplayAcceptanceCache',
    () => ({
        getPerSourceAcceptanceRateCached: (...args: unknown[]) =>
            mockGetAcceptanceRates(...args),
    }),
)

jest.mock('../../lastfm', () => ({
    isLastFmConfigured: jest.fn(),
    getSessionKeyForUser: jest.fn(),
    getTrackMetadata: jest.fn(),
    isLastFmInvalidSessionError: jest.fn(),
    handleDeadLastFmSession: jest.fn(),
    updateNowPlaying: jest.fn(),
    scrobble: jest.fn(),
}))

jest.mock('../../utils/music/skipReasonMap', () => ({
    getSkipReasonEmojis: () => ['👎', '😴', '🎸', '🔁'],
}))

jest.mock('./lastfmScrobbler', () => ({
    clearLastFmTrackTiming: jest.fn(),
}))

import { describe, expect, it, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { TextChannel, Guild, Message, EmbedBuilder } from 'discord.js'
import { sendNowPlayingEmbed } from './nowPlayingDisplay'
import { translatorFor } from '../../i18n'
import { MUSIC_ACTION_STYLE } from '../../utils/music/musicActionStyle'

type SentPayload = { embeds: EmbedBuilder[]; components: unknown[] }

describe('nowPlayingDisplay', () => {
    let mockQueue: Partial<GuildQueue>
    let mockTrack: Partial<Track>
    let mockGuild: Partial<Guild>
    let mockChannel: Partial<TextChannel>
    let mockMessage: Partial<Message>

    const sentPayload = (): SentPayload =>
        (mockChannel.send as jest.Mock).mock.calls[0][0] as SentPayload

    beforeEach(() => {
        jest.clearAllMocks()
        mockTranslatorForInteraction.mockResolvedValue(translatorFor('en'))
        mockCreateNowPlayingButtons.mockReturnValue('compact-row')
        mockGetAutoplayCount.mockResolvedValue(3)
        mockGetAcceptanceRates.mockResolvedValue([])

        mockGuild = {
            id: 'guild-123',
        }

        mockChannel = {
            id: 'channel-456',
            send: jest.fn(),
        }

        mockMessage = {
            id: 'message-789',
            react: jest.fn().mockResolvedValue(undefined),
            edit: jest.fn().mockResolvedValue(undefined),
        }

        mockTrack = {
            title: 'Test Track',
            author: 'Test Artist',
            url: 'https://example.com/track',
            thumbnail: 'https://example.com/thumb.png',
            duration: '3:30',
            durationMS: 210000,
            requestedBy: null,
        }

        mockQueue = {
            guild: mockGuild as Guild,
            metadata: {
                channel: mockChannel as TextChannel,
            },
            currentTrack: mockTrack as Track,
        }

        ;(mockChannel.send as jest.Mock).mockResolvedValue(mockMessage)
    })

    describe('compact layout', () => {
        it('renders the track on one line, colored as now playing', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            const embed = sentPayload().embeds[0].data
            expect(embed.description).toBe(
                '▶️ Now playing [**Test Track**](https://example.com/track) · Test Artist (3:30)',
            )
            expect(embed.color).toBe(MUSIC_ACTION_STYLE.nowPlaying.color)
            expect(embed.thumbnail).toBeUndefined()
            expect(embed.fields).toBeUndefined()
            expect(embed.timestamp).toBeUndefined()
        })

        it('resolves the guild language from the queue guild', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(mockTranslatorForInteraction).toHaveBeenCalledWith({
                guildId: 'guild-123',
                guild: mockGuild,
            })
        })

        it('sends a single compact button row with the localized More label', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(mockCreateNowPlayingButtons).toHaveBeenCalledWith(
                mockQueue,
                'More',
            )
            expect(sentPayload().components).toEqual(['compact-row'])
        })

        it('puts the requester in the footer of a requested track', async () => {
            mockTrack.requestedBy = {
                username: 'alice',
            } as Track['requestedBy']

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(sentPayload().embeds[0].data.footer?.text).toBe(
                'Requested by alice',
            )
        })

        it('has no footer for a requested track without a requester', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(sentPayload().embeds[0].data.footer).toBeUndefined()
        })

        it('puts the autoplay line, reason and count in the footer of an autoplay pick', async () => {
            mockTrack.metadata = {
                recommendationReason: 'similar to Test Artist',
            }

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(sentPayload().embeds[0].data.footer?.text).toBe(
                '✨ Autoplay from your session listening history · similar to Test Artist · 3/50 songs',
            )
        })

        it('appends the acceptance rate to the reason when known', async () => {
            mockTrack.metadata = {
                recommendationReason: 'similar to Test Artist',
                recommendationSource: 'lastfm',
            }
            mockGetAcceptanceRates.mockResolvedValue([
                { source: 'lastfm', acceptanceRate: 0.62 },
            ])

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(sentPayload().embeds[0].data.footer?.text).toContain(
                'similar to Test Artist · 62% accepted',
            )
        })

        it('never renders an empty title or author', async () => {
            mockTrack.title = ''
            mockTrack.author = ''
            mockTrack.duration = '0:00'

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(sentPayload().embeds[0].data.description).toBe(
                '▶️ Now playing [**Unknown track**](https://example.com/track) · Unknown artist',
            )
        })
    })

    describe('skip-reason reactions', () => {
        it('does not prefill reactions on a requested track', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(mockMessage.react).not.toHaveBeenCalled()
        })

        it('prefills the reactions on an autoplay pick', async () => {
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockMessage.react).toHaveBeenCalledTimes(4)
        })

        it('removes the whole skip-reason reaction when the reused message moves to a requested track', async () => {
            const wholeRemove = jest.fn().mockResolvedValue(undefined)
            const ownRemove = jest.fn().mockResolvedValue(undefined)
            const otherRemove = jest.fn().mockResolvedValue(undefined)
            const reused = {
                id: 'reused-message',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
                reactions: {
                    cache: new Map([
                        [
                            '👎',
                            {
                                me: true,
                                remove: wholeRemove,
                                users: { remove: ownRemove },
                            },
                        ],
                        [
                            '🔥',
                            {
                                me: false,
                                remove: otherRemove,
                                users: { remove: otherRemove },
                            },
                        ],
                    ]),
                },
            }
            mockGuild.id = 'guild-reused'
            ;(mockChannel.messages as unknown) = {
                fetch: jest.fn().mockResolvedValue(reused),
            }
            // First send registers the message for this guild.
            ;(mockChannel.send as jest.Mock).mockResolvedValue(reused)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(reused.edit).toHaveBeenCalledWith(
                expect.objectContaining({ components: ['compact-row'] }),
            )
            // Listeners' votes go too, not only the bot's.
            expect(wholeRemove).toHaveBeenCalledTimes(1)
            expect(ownRemove).not.toHaveBeenCalled()
            expect(otherRemove).not.toHaveBeenCalled()
        })

        it('takes back only its own reaction without Manage Messages', async () => {
            const wholeRemove = jest
                .fn()
                .mockRejectedValue(new Error('Missing Permissions'))
            const ownRemove = jest.fn().mockResolvedValue(undefined)
            const reused = {
                id: 'reused-no-perms',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
                reactions: {
                    cache: new Map([
                        [
                            '👎',
                            {
                                me: true,
                                remove: wholeRemove,
                                users: { remove: ownRemove },
                            },
                        ],
                    ]),
                },
            }
            mockGuild.id = 'guild-reused-no-perms'
            ;(mockChannel.messages as unknown) = {
                fetch: jest.fn().mockResolvedValue(reused),
            }
            ;(mockChannel.send as jest.Mock).mockResolvedValue(reused)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )

            expect(wholeRemove).toHaveBeenCalledTimes(1)
            expect(ownRemove).toHaveBeenCalledTimes(1)
        })

        it('keeps its reactions when the reused message moves to another autoplay pick', async () => {
            const ownRemove = jest.fn().mockResolvedValue(undefined)
            const reused = {
                id: 'reused-autoplay',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
                reactions: {
                    cache: new Map([
                        ['👎', { me: true, users: { remove: ownRemove } }],
                    ]),
                },
            }
            mockGuild.id = 'guild-reused-autoplay'
            ;(mockChannel.messages as unknown) = {
                fetch: jest.fn().mockResolvedValue(reused),
            }
            ;(mockChannel.send as jest.Mock).mockResolvedValue(reused)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(ownRemove).not.toHaveBeenCalled()
        })
    })

    describe('emoji prefill logging', () => {
        it('logs once per guild when emoji prefill fails', async () => {
            const reactError = new Error('Missing Permissions')
            ;(reactError as any).code = 50013
            ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Failed to prefill skip-reason emojis',
                    ),
                    data: expect.objectContaining({
                        guildId: 'guild-123',
                        errorCode: 50013,
                    }),
                }),
            )
        })

        it('does not log duplicate warnings for same guild in session', async () => {
            // A guild of its own: the warned-guild set is module state, and
            // the test above already warned for guild-123.
            mockGuild.id = 'guild-duplicate-warning'
            const reactError = new Error('Missing Permissions')
            ;(reactError as any).code = 50013
            ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )
            expect(mockWarnLog).toHaveBeenCalledTimes(1)
            mockWarnLog.mockClear()

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockWarnLog).not.toHaveBeenCalled()
        })

        it('logs partial emoji prefill as debug message', async () => {
            mockGuild.id = 'guild-partial'
            let callCount = 0
            ;(mockMessage.react as jest.Mock).mockImplementation(() => {
                callCount++
                if (callCount === 1) {
                    return Promise.reject(new Error('Missing Permissions'))
                }
                return Promise.resolve(undefined)
            })

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Sent now playing message',
                    ),
                    data: expect.objectContaining({
                        emojiPrefill: expect.objectContaining({
                            successCount: 3,
                            attemptedCount: 4,
                            allSuccessful: false,
                        }),
                    }),
                }),
            )
        })

        it('includes emoji prefill stats in now-playing message debug log', async () => {
            mockGuild.id = 'guild-stats'
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Sent now playing message to channel',
                    data: expect.objectContaining({
                        guildId: 'guild-stats',
                        emojiPrefill: expect.objectContaining({
                            successCount: 4,
                            attemptedCount: 4,
                            allSuccessful: true,
                        }),
                    }),
                }),
            )
        })

        it('handles emoji prefill failure gracefully without throwing', async () => {
            ;(mockMessage.react as jest.Mock).mockRejectedValue(
                new Error('Missing Permissions'),
            )

            await expect(
                sendNowPlayingEmbed(
                    mockQueue as GuildQueue,
                    mockTrack as Track,
                    true,
                ),
            ).resolves.not.toThrow()
        })

        it('extracts error code from discord error object', async () => {
            mockGuild.id = 'guild-code-obj'
            const reactError = new Error('Missing Permissions')
            ;(reactError as any).code = 50013
            ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        errorCode: 50013,
                    }),
                }),
            )
        })

        it('extracts error code from error message when not in code property', async () => {
            mockGuild.id = 'guild-code-msg'
            const reactError = new Error('Discord API error 50013')
            ;(mockMessage.react as jest.Mock).mockRejectedValue(reactError)

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        errorCode: '50013',
                    }),
                }),
            )
        })

        it('updates existing message with emoji reactions and logs stats', async () => {
            const mockExistingMessage = {
                id: 'existing-message-id',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
            }
            ;(mockChannel.messages as any) = {
                fetch: jest.fn().mockResolvedValue(mockExistingMessage),
            }

            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Updated now playing message in channel',
                }),
            )
        })
    })

    // The controls were edited in place on every track, so once the chat
    // moved on an autoplay pick updated a message nobody could see.
    describe('buried controls', () => {
        const setup = (newerCount: number) => {
            const previous = {
                id: 'previous-message',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
                delete: jest.fn().mockResolvedValue(undefined),
            }
            const fresh = {
                id: 'fresh-message',
                edit: jest.fn().mockResolvedValue(undefined),
                react: jest.fn().mockResolvedValue(undefined),
            }
            const newer = new Map(
                Array.from({ length: newerCount }, (_, i) => [`m${i}`, {}]),
            )
            ;(mockChannel.messages as unknown) = {
                fetch: jest.fn(async (arg: unknown) => {
                    if (typeof arg !== 'string') return newer
                    return arg === fresh.id ? fresh : previous
                }),
            }
            return { previous, fresh }
        }

        const playTwice = async (previous: object, fresh: object) => {
            ;(mockChannel.send as jest.Mock).mockResolvedValueOnce(previous)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )
            ;(mockChannel.send as jest.Mock).mockResolvedValueOnce(fresh)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                true,
            )
        }

        it('reposts the controls at the bottom once other messages bury them', async () => {
            mockGuild.id = 'guild-buried'
            const { previous, fresh } = setup(5)

            await playTwice(previous, fresh)

            // Buttons come off the old copy; it is never deleted.
            expect(previous.edit).toHaveBeenCalledTimes(1)
            expect(previous.edit).toHaveBeenCalledWith({ components: [] })
            expect(previous.delete).not.toHaveBeenCalled()
            expect(mockChannel.send).toHaveBeenCalledTimes(2)
            expect(mockChannel.messages?.fetch).toHaveBeenCalledWith({
                after: 'previous-message',
                limit: 5,
            })
        })

        it('edits the controls in place while they are still near the bottom', async () => {
            mockGuild.id = 'guild-visible'
            const { previous, fresh } = setup(4)

            await playTwice(previous, fresh)

            expect(previous.edit).toHaveBeenCalledTimes(1)
            expect(previous.edit).not.toHaveBeenCalledWith({ components: [] })
            expect(previous.delete).not.toHaveBeenCalled()
            expect(mockChannel.send).toHaveBeenCalledTimes(1)
        })

        it('updates in place, without a second copy, when the buttons cannot be removed', async () => {
            mockGuild.id = 'guild-strip-fails'
            const { previous, fresh } = setup(5)
            previous.edit.mockImplementation(async (payload: unknown) => {
                if ((payload as { embeds?: unknown }).embeds) return undefined
                throw new Error('Missing Access')
            })

            await playTwice(previous, fresh)

            expect(previous.edit).toHaveBeenCalledWith({ components: [] })
            expect(previous.edit).toHaveBeenCalledWith(
                expect.objectContaining({ components: ['compact-row'] }),
            )
            expect(mockChannel.send).toHaveBeenCalledTimes(1)
        })

        it('posts one replacement when two tracks start at once', async () => {
            mockGuild.id = 'guild-concurrent'
            const { previous, fresh } = setup(5)
            ;(mockChannel.send as jest.Mock).mockResolvedValueOnce(previous)
            await sendNowPlayingEmbed(
                mockQueue as GuildQueue,
                mockTrack as Track,
                false,
            )
            ;(mockChannel.send as jest.Mock).mockResolvedValue(fresh)

            await Promise.all([
                sendNowPlayingEmbed(
                    mockQueue as GuildQueue,
                    mockTrack as Track,
                    true,
                ),
                sendNowPlayingEmbed(
                    mockQueue as GuildQueue,
                    mockTrack as Track,
                    true,
                ),
            ])

            // The second send sees the replacement, not the old message.
            expect(previous.edit).toHaveBeenCalledTimes(1)
        })
    })
})
