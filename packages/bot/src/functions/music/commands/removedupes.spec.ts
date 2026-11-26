jest.mock('../../../i18n/acknowledgeAndTranslate', () => ({
    acknowledgeAndTranslate: jest.fn(async () =>
        jest
            .requireActual<typeof import('../../../i18n')>('../../../i18n')
            .translatorFor('en'),
    ),
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireQueue: jest.fn(async () => true),
    requireSameVoiceChannel: jest.fn(async () => true),
    requireDJRoleInGuild: jest.fn(async () => true),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

import removedupesCommand, { removeDuplicateTracks } from './removedupes'
import { interactionReply } from '../../../utils/general/interactionReply'
import {
    requireDJRoleInGuild,
    requireQueue,
    requireSameVoiceChannel,
} from '../../../utils/command/commandValidations'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const track = (title: string, author: string, url: string) => ({
    title,
    author,
    url,
})

function queueOf(
    upcoming: ReturnType<typeof track>[],
    current: ReturnType<typeof track> | null = null,
) {
    const remove = jest.fn()
    return {
        remove,
        queue: {
            currentTrack: current,
            tracks: { toArray: () => upcoming },
            node: { remove },
        },
    }
}

const interaction = { guildId: 'guild-1', user: { id: 'user-1' } }
const run = () =>
    removedupesCommand.execute({ client: {}, interaction } as never)
const replied = () => (interactionReply as jest.Mock).mock.calls[0][0].content

describe('/removedupes', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(requireSameVoiceChannel as jest.Mock).mockResolvedValue(true)
        ;(requireDJRoleInGuild as jest.Mock).mockResolvedValue(true)
        ;(requireQueue as jest.Mock).mockResolvedValue(true)
    })

    it('keeps the first of each song and removes the repeats', () => {
        const first = track('Creep', 'Radiohead', 'https://a/1')
        const sameLink = track('Creep (Remaster)', 'Radiohead', 'https://a/1')
        const sameSong = track('Creep', 'Radiohead', 'https://b/9')
        const other = track('Karma Police', 'Radiohead', 'https://a/2')
        const { queue, remove } = queueOf([first, sameLink, other, sameSong])

        expect(removeDuplicateTracks(queue as never)).toBe(2)
        expect(remove.mock.calls.map(([removed]) => removed)).toEqual([
            sameLink,
            sameSong,
        ])
    })

    it('removes an upcoming copy of the song that is playing', () => {
        const playing = track('Creep', 'Radiohead', 'https://a/1')
        const copy = track('Creep', 'Radiohead', 'https://a/1')
        const { queue, remove } = queueOf([copy], playing)

        expect(removeDuplicateTracks(queue as never)).toBe(1)
        expect(remove).toHaveBeenCalledWith(copy)
    })

    it('keeps two songs with one title by different artists', () => {
        const { queue, remove } = queueOf([
            track('Creep', 'Radiohead', 'https://a/1'),
            track('Creep', 'TLC', 'https://a/2'),
        ])

        expect(removeDuplicateTracks(queue as never)).toBe(0)
        expect(remove).not.toHaveBeenCalled()
    })

    it('reports how many songs it removed', async () => {
        const song = track('Creep', 'Radiohead', 'https://a/1')
        ;(resolveGuildQueue as jest.Mock).mockReturnValue(
            queueOf([song, { ...song }, { ...song }]),
        )

        await run()

        expect(replied().content).toBe(
            '🧹 Removed 2 repeated songs from the queue.',
        )
    })

    it('says so when nothing repeats', async () => {
        ;(resolveGuildQueue as jest.Mock).mockReturnValue(
            queueOf([track('Creep', 'Radiohead', 'https://a/1')]),
        )

        await run()

        expect(replied().content).toBe('No repeated songs in the queue.')
    })

    it.each([
        ['outside the voice channel', requireSameVoiceChannel],
        ['without the DJ role', requireDJRoleInGuild],
        ['without a queue', requireQueue],
    ])('does nothing %s', async (_label, guard) => {
        ;(guard as jest.Mock).mockResolvedValue(false)
        const { queue, remove } = queueOf([
            track('Creep', 'Radiohead', 'https://a/1'),
            track('Creep', 'Radiohead', 'https://a/1'),
        ])
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await run()

        expect(remove).not.toHaveBeenCalled()
        expect(interactionReply).not.toHaveBeenCalled()
    })
})
