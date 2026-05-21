import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { unlink } from 'fs/promises'

const unlinkMock = jest.fn()
const errorLogMock = jest.fn()
const infoLogMock = jest.fn()

jest.mock('fs/promises', () => ({
	unlink: (...args: unknown[]) => unlinkMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
	errorLog: (...args: unknown[]) => errorLogMock(...args),
	infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

// Import after mocks
import { deleteDownloadedFile } from './downloadUtils.js'

describe('deleteContent', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		unlinkMock.mockResolvedValue(undefined)
	})

	describe('deleteDownloadedFile', () => {
		it('deletes file at given path', async () => {
			const filePath = '/downloads/video.mp4'
			await deleteDownloadedFile(filePath)

			expect(unlinkMock).toHaveBeenCalledWith(filePath)
		})

		it('logs successful deletion', async () => {
			const filePath = '/downloads/video.mp4'
			await deleteDownloadedFile(filePath)

			expect(infoLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining(`Deleted file: ${filePath}`),
				}),
			)
		})

		it('handles file not found error gracefully', async () => {
			const error = new Error('ENOENT: no such file or directory')
			unlinkMock.mockRejectedValue(error)

			const filePath = '/downloads/missing.mp4'
			await expect(deleteDownloadedFile(filePath)).resolves.not.toThrow()

			expect(errorLogMock).toHaveBeenCalled()
		})

		it('handles permission denied error gracefully', async () => {
			const error = new Error('EACCES: permission denied')
			unlinkMock.mockRejectedValue(error)

			const filePath = '/downloads/readonly.mp4'
			await expect(deleteDownloadedFile(filePath)).resolves.not.toThrow()

			expect(errorLogMock).toHaveBeenCalled()
		})

		it('logs errors on deletion failure', async () => {
			const error = new Error('Disk I/O error')
			unlinkMock.mockRejectedValue(error)

			await deleteDownloadedFile('/downloads/video.mp4')

			expect(errorLogMock).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining('Error deleting file'),
				}),
			)
		})

		it('works with absolute paths', async () => {
			const filePath = '/tmp/downloads/audio.mp3'
			await deleteDownloadedFile(filePath)

			expect(unlinkMock).toHaveBeenCalledWith(filePath)
		})

		it('works with relative paths', async () => {
			const filePath = 'downloads/video.mp4'
			await deleteDownloadedFile(filePath)

			expect(unlinkMock).toHaveBeenCalledWith(filePath)
		})
	})
})
