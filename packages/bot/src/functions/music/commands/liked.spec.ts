const interactionReplyMock = jest.fn()
const requireGuildMock = jest.fn()
const requireVoiceChannelMock = jest.fn()
const requireSameVoiceChannelMock = jest.fn()
const requireDJRoleMock = jest.fn()
const resolveGuildQueueMock = jest.fn()
const createQueueMock = jest.fn()
const queueConnectMock = jest.fn()
const listLikedTracksMock = jest.fn()
const queueLikedTracksMock = jest.fn()
const unlikeTrackMock = jest.fn()

jest.mock('../../../i18n/translatorForInteraction', () => ({
    translatorForInteraction: jest.fn(async () =>
        jest
            .requireActual<typeof import('../../../i18n')>('../../../i18n')
            .translatorFor('en'),
    ),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createInfoEmbed: (title: string, description: string) => ({
        title,
        description,
    }),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
    requireVoiceChannel: (...args: unknown[]) =>
        requireVoiceChannelMock(...args),
    requireDJRoleInGuild: (...args: unknown[]) => requireDJRoleMock(...args),
    requireSameVoiceChannel: (...args: unknown[]) =>
        requireSameVoiceChannelMock(...args),
}))

jest.mock('../../../handlers/queueHandler', () => ({
    createQueue: (...args: unknown[]) => createQueueMock(...args),
    queueConnect: (...args: unknown[]) => queueConnectMock(...args),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: (...args: unknown[]) => resolveGuildQueueMock(...args),
}))

jest.mock('../../../services/likedTracks', () => ({
    LIKED_TRACKS_MAX: 500,
    listLikedTracks: (...args: unknown[]) => listLikedTracksMock(...args),
    queueLikedTracks: (...args: unknown[]) => queueLikedTracksMock(...args),
    unlikeTrack: (...args: unknown[]) => unlikeTrackMock(...args),
}))

import likedCommand from './liked'

const user = { id: 'user-1' }
const queue = { id: 'queue', deleted: false, delete: jest.fn() }
const library = (count: number) => ({
    tracks: Array.from({ length: count }, (_, i) => ({ id: `l${i}` })),
    total: count,
})

function run(subcommand: string, song = 'liked-1') {
    const interaction = {
        guildId: 'guild-1',
        user,
        deferred: false,
        replied: false,
        deferReply: jest.fn().mockResolvedValue(undefined),
        options: {
            getSubcommand: () => subcommand,
            getString: () => song,
        },
    }
    return {
        interaction,
        done: likedCommand.execute({ client: {}, interaction } as never),
    }
}

const replied = () => interactionReplyMock.mock.calls[0][0].content

describe('/liked', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        requireGuildMock.mockResolvedValue(true)
        requireVoiceChannelMock.mockResolvedValue(true)
        requireDJRoleMock.mockResolvedValue(true)
        requireSameVoiceChannelMock.mockResolvedValue(true)
        listLikedTracksMock.mockResolvedValue(library(12))
        resolveGuildQueueMock.mockReturnValue({ queue })
        queueConnectMock.mockResolvedValue(undefined)
    })

    describe('list', () => {
        it('shows the newest songs to the member only, with the rest counted', async () => {
            listLikedTracksMock.mockResolvedValue({
                tracks: [
                    {
                        id: 'a',
                        title: 'Creep',
                        author: 'Radiohead',
                        url: 'https://open.spotify.com/track/a',
                    },
                ],
                total: 4,
            })

            const { interaction, done } = run('list')
            await done

            expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 })
            expect(listLikedTracksMock).toHaveBeenCalledWith('user-1', 15)
            expect(replied().ephemeral).toBe(true)
            expect(replied().embeds[0]).toEqual({
                title: '❤️ Your liked songs (4)',
                description:
                    '1. [Creep](https://open.spotify.com/track/a), Radiohead\nand 3 more',
            })
        })

        it('escapes Markdown in the title and artist', async () => {
            listLikedTracksMock.mockResolvedValue({
                tracks: [
                    {
                        id: 'a',
                        title: 'Song [Live] *2*',
                        author: '_Band_',
                        url: 'https://open.spotify.com/track/a',
                    },
                ],
                total: 1,
            })

            await run('list').done

            expect(replied().embeds[0].description).toBe(
                '1. [Song \\[Live\\] \\*2\\*](https://open.spotify.com/track/a), \\_Band\\_',
            )
        })

        it('says the list could not be read, not that it is empty', async () => {
            listLikedTracksMock.mockResolvedValue(null)

            await run('list').done

            expect(replied().content).toContain("Couldn't read")
        })

        it('explains /like to a member with no liked songs', async () => {
            listLikedTracksMock.mockResolvedValue({ tracks: [], total: 0 })

            await run('list').done

            expect(replied().content).toContain('Use `/like`')
        })
    })

    describe('remove', () => {
        it('removes the picked song', async () => {
            unlikeTrackMock.mockResolvedValue({ title: 'Creep' })

            await run('remove', 'liked-9').done

            expect(unlikeTrackMock).toHaveBeenCalledWith('user-1', 'liked-9')
            expect(replied().content).toBe(
                'Removed **Creep** from your liked songs.',
            )
            expect(replied().ephemeral).toBe(true)
        })

        it('says so when the song is not in the list', async () => {
            unlikeTrackMock.mockResolvedValue(null)

            await run('remove', 'typed text').done

            expect(replied().content).toContain("isn't in your liked songs")
        })
    })

    describe('play', () => {
        const found = (added: number, missed = 0) =>
            queueLikedTracksMock.mockResolvedValue({ added, missed })

        it('queues the liked songs in the voice channel', async () => {
            found(12)

            const { interaction, done } = run('play')
            await done

            expect(interaction.deferReply).toHaveBeenCalledWith()
            expect(listLikedTracksMock).toHaveBeenCalledWith('user-1', 500)
            expect(queueConnectMock).toHaveBeenCalledWith({
                queue,
                interaction,
            })
            expect(queueLikedTracksMock).toHaveBeenCalledWith(
                queue,
                user,
                library(12).tracks,
            )
            expect(replied().content).toBe(
                '❤️ Added 12 of your liked songs to the queue.',
            )
        })

        it('creates a queue when the guild has none', async () => {
            resolveGuildQueueMock.mockReturnValue({ queue: null })
            createQueueMock.mockResolvedValue(queue)
            found(1)

            await run('play').done

            expect(createQueueMock).toHaveBeenCalledTimes(1)
            expect(requireSameVoiceChannelMock).not.toHaveBeenCalled()
            expect(queueLikedTracksMock).toHaveBeenCalled()
        })

        it('mentions the songs it could not find', async () => {
            found(10, 2)

            await run('play').done

            expect(replied().content).toContain(
                '2 could not be found right now.',
            )
        })

        it('does not join the channel for a member with no liked songs', async () => {
            listLikedTracksMock.mockResolvedValue(library(0))

            await run('play').done

            expect(queueConnectMock).not.toHaveBeenCalled()
            expect(createQueueMock).not.toHaveBeenCalled()
            expect(replied().content).toContain('Use `/like`')
        })

        it('does not join the channel when the list cannot be read', async () => {
            listLikedTracksMock.mockResolvedValue(null)

            await run('play').done

            expect(queueConnectMock).not.toHaveBeenCalled()
            expect(replied().content).toContain("Couldn't read")
        })

        it('leaves again when a queue made for it found nothing', async () => {
            resolveGuildQueueMock.mockReturnValue({ queue: null })
            createQueueMock.mockResolvedValue(queue)
            found(0, 5)

            await run('play').done

            expect(queue.delete).toHaveBeenCalledTimes(1)
            expect(replied().content).toContain("Couldn't find any")
        })

        it('keeps a queue that was already there when it found nothing', async () => {
            found(0, 5)

            await run('play').done

            expect(queue.delete).not.toHaveBeenCalled()
            expect(replied().content).toContain("Couldn't find any")
        })

        it('says so when it cannot join the voice channel', async () => {
            queueConnectMock.mockRejectedValue(new Error('no permission'))

            await run('play').done

            expect(queueLikedTracksMock).not.toHaveBeenCalled()
            expect(replied().content).toContain("Couldn't connect")
        })

        it('checks the caller against the channel where music is on', async () => {
            requireSameVoiceChannelMock.mockResolvedValue(false)

            const { interaction, done } = run('play')
            await done

            expect(requireSameVoiceChannelMock).toHaveBeenCalledWith(
                queue,
                interaction,
            )
            expect(listLikedTracksMock).not.toHaveBeenCalled()
            expect(queueLikedTracksMock).not.toHaveBeenCalled()
        })

        it.each([
            ['a voice channel', requireVoiceChannelMock],
            ['the DJ role', requireDJRoleMock],
        ])('stops without %s', async (_label, guard) => {
            guard.mockResolvedValue(false)

            await run('play').done

            expect(queueLikedTracksMock).not.toHaveBeenCalled()
        })
    })
})
