import { QueueRepeatMode } from 'discord-player'
import { repeatModeToEnum, repeatModeToString } from './mappers'

describe('web music repeat mode mappers', () => {
    it('maps autoplay enum to string', () => {
        expect(repeatModeToString(QueueRepeatMode.AUTOPLAY)).toBe('autoplay')
    })

    it('maps autoplay string to enum', () => {
        expect(repeatModeToEnum('autoplay')).toBe(QueueRepeatMode.AUTOPLAY)
    })
})
