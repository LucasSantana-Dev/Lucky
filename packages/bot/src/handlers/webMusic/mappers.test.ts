import { QueueRepeatMode } from 'discord-player'
import { repeatModeToEnum, repeatModeToString } from './mappers'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
}))

describe('web music repeat mode mappers', () => {
    it('maps autoplay enum to string', () => {
        expect(repeatModeToString(QueueRepeatMode.AUTOPLAY)).toBe('autoplay')
    })

    it('maps autoplay string to enum', () => {
        expect(repeatModeToEnum('autoplay')).toBe(QueueRepeatMode.AUTOPLAY)
    })
})
