import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import getMusicCommands from './index'

const getCommandsFromDirectoryMock = jest.fn()

jest.mock('../../../utils/command/getCommandsFromDirectory', () => ({
    getCommandsFromDirectory: (...args: unknown[]) =>
        getCommandsFromDirectoryMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

describe('music command loader', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('exports a function that loads commands with music category', async () => {
        getCommandsFromDirectoryMock.mockResolvedValue([])

        const result = await getMusicCommands()

        expect(getCommandsFromDirectoryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'music',
            }),
        )
        expect(result).toEqual([])
    })

    it('returns empty array on error', async () => {
        getCommandsFromDirectoryMock.mockRejectedValue(new Error('Test error'))

        const result = await getMusicCommands()

        expect(result).toEqual([])
    })
})
