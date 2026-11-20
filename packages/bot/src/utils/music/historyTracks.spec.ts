import type { GuildQueue, Track } from 'discord-player'
import { getAllHistoryTracks } from './historyTracks'

const t = (id: string) => ({ id }) as unknown as Track
const queueWith = (history: unknown) => ({ history }) as unknown as GuildQueue

describe('getAllHistoryTracks', () => {
    it('returns toArray() as is, newest first', () => {
        const newest = t('new')
        const oldest = t('old')
        const q = queueWith({ tracks: { toArray: () => [newest, oldest] } })
        expect(getAllHistoryTracks(q)).toEqual([newest, oldest])
    })

    it('falls back to the data array', () => {
        const a = t('a')
        expect(
            getAllHistoryTracks(queueWith({ tracks: { data: [a] } })),
        ).toEqual([a])
    })

    it('returns an empty array without history', () => {
        expect(getAllHistoryTracks(queueWith(undefined))).toEqual([])
        expect(getAllHistoryTracks(queueWith({}))).toEqual([])
        expect(getAllHistoryTracks(queueWith({ tracks: {} }))).toEqual([])
    })
})
