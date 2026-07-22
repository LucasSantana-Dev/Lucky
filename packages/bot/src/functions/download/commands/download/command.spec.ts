import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const interactionReplyMock = jest.fn()
const downloadServiceMock = {
    executeDownload: jest.fn(),
}

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: any[]) => interactionReplyMock(...args),
}))

jest.mock('./service', () => ({
    DownloadCommandService: jest.fn(() => downloadServiceMock),
}))

import downloadCommand from './command'

function createMockUser(id = 'user-123') {
    return {
        id,
    }
}

function createInteraction({
    userId = 'user-123',
    user = null as any,
    guildId = 'guild-123',
    url = 'https://example.com/video.mp4',
} = {}) {
    const interaction = {
        user: user || createMockUser(userId),
        guildId,
        options: {
            getString: jest.fn((name: string, required?: boolean) =>
                name === 'url' ? url : null,
            ),
        },
    }

    return interaction as any
}

describe('download command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('shows processing message immediately', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880, // 5 MB
        })

        await downloadCommand.execute({ interaction })

        // First reply should be the processing message
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Processing'),
                }),
            }),
        )
    })

    test('extracts URL from interaction options', async () => {
        const testUrl = 'https://youtube.com/watch?v=dQw4w9WgXcQ'
        const interaction = createInteraction({ url: testUrl })
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        expect(downloadServiceMock.executeDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                url: testUrl,
            }),
        )
    })

    test('passes user ID to download service', async () => {
        const userId = 'user-999'
        const interaction = createInteraction({ userId })
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        expect(downloadServiceMock.executeDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                userId,
            }),
        )
    })

    test('passes guild ID to download service', async () => {
        const guildId = 'guild-456'
        const interaction = createInteraction({ guildId })
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        expect(downloadServiceMock.executeDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                guildId,
            }),
        )
    })

    test('sets format to video by default', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        expect(downloadServiceMock.executeDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                format: 'video',
            }),
        )
    })

    test('shows success message with file name and size on successful download', async () => {
        const interaction = createInteraction()
        const fileName = 'my-video.mp4'
        const fileSize = 52428800 // 50 MB
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName,
            fileSize,
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Downloaded'),
                }),
            }),
        )
    })

    test('formats file size correctly for success message', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880, // 5 MB
        })

        await downloadCommand.execute({ interaction })

        // Should format 5242880 bytes as ~5.00 MB
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('.00 MB'),
                }),
            }),
        )
    })

    test('handles downloads larger than 1 GB', async () => {
        const interaction = createInteraction()
        const largeSize = 1073741824 // 1 GB
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'large-video.mp4',
            fileSize: largeSize,
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('1024.00 MB'),
                }),
            }),
        )
    })

    test('shows error message when download fails', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: false,
            error: 'URL not accessible',
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Download failed'),
                }),
            }),
        )
    })

    test('includes error message in failure response', async () => {
        const interaction = createInteraction()
        const errorMessage = 'Invalid URL format'
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: false,
            error: errorMessage,
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining(errorMessage),
                }),
            }),
        )
    })

    test('marks error response as ephemeral', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: false,
            error: 'Download failed',
        })

        await downloadCommand.execute({ interaction })

        // Find the reply call with the error
        const errorCall = interactionReplyMock.mock.calls.find((call) =>
            call[0].content.content.includes('Download failed'),
        )
        expect(errorCall[0]).toHaveProperty('content.ephemeral', true)
    })

    test('handles unexpected errors during download', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockRejectedValue(
            new Error('Network error'),
        )

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('An error occurred'),
                }),
            }),
        )
    })

    test('marks unexpected error response as ephemeral', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockRejectedValue(
            new Error('Network error'),
        )

        await downloadCommand.execute({ interaction })

        // Find the reply call with the error
        const errorCall = interactionReplyMock.mock.calls.find((call) =>
            call[0].content.content.includes('An error occurred'),
        )
        expect(errorCall[0]).toHaveProperty('content.ephemeral', true)
    })

    test('formats zero file size gracefully', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'empty.mp4',
            fileSize: 0,
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Unknown'),
                }),
            }),
        )
    })

    test('handles undefined file size', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: undefined,
        })

        await downloadCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Unknown'),
                }),
            }),
        )
    })

    test('has correct command metadata', () => {
        expect(downloadCommand.data.name).toBe('download')
        expect(downloadCommand.data.description).toContain('Download media')
    })

    test('handles guild ID as undefined', async () => {
        const interaction = createInteraction({ guildId: null as any })
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        expect(downloadServiceMock.executeDownload).toHaveBeenCalledWith(
            expect.objectContaining({
                guildId: undefined,
            }),
        )
    })

    test('sends multiple replies in correct order', async () => {
        const interaction = createInteraction()
        downloadServiceMock.executeDownload.mockResolvedValue({
            success: true,
            fileName: 'video.mp4',
            fileSize: 5242880,
        })

        await downloadCommand.execute({ interaction })

        // Should have at least 2 calls: processing and then success/failure
        expect(interactionReplyMock.mock.calls.length).toBeGreaterThanOrEqual(2)

        // First call should be processing message
        expect(interactionReplyMock.mock.calls[0][0].content.content).toContain(
            'Processing',
        )
    })
})
