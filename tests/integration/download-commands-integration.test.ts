/**
 * Integration tests for download commands
 * Testing complete download workflows
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"

// Mock dependencies
jest.mock("../../src/utils/download/ytDlpUtils")
jest.mock("../../src/utils/download/downloadVideo")
jest.mock("../../src/utils/download/downloadAudio")
jest.mock("../../src/utils/misc/generateFileName")

describe("Download Commands Integration", () => {
    let mockInteraction: any
    let mockClient: any

    beforeEach(() => {
        jest.clearAllMocks()

        // Mock interaction
        mockInteraction = {
            user: { id: "user123", username: "TestUser" },
            guild: { id: "guild123" },
            channel: { id: "channel123" },
            options: {
                getString: jest.fn(),
                getBoolean: jest.fn(),
            },
            deferReply: jest.fn().mockResolvedValue({}),
            editReply: jest.fn().mockResolvedValue({}),
            followUp: jest.fn().mockResolvedValue({}),
        }

        // Mock client
        mockClient = {
            user: { id: "bot123" },
        }
    })

    describe("Download Command Integration", () => {
        it("should handle successful video download", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false) // Audio only = false

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: true,
                filePath: "/downloads/test.mp4",
            })

            const { generateFileName } = await import(
                "../../src/utils/misc/generateFileName"
            )
            ;(generateFileName as jest.Mock).mockReturnValue("test.mp4")

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(downloadVideo).toHaveBeenCalled()
        })

        it("should handle successful audio download", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(true) // Audio only = true

            const { downloadAudio } = await import(
                "../../src/utils/download/downloadAudio"
            )
            ;(downloadAudio as jest.Mock).mockResolvedValue({
                success: true,
                filePath: "/downloads/test.mp3",
            })

            const { generateFileName } = await import(
                "../../src/utils/misc/generateFileName"
            )
            ;(generateFileName as jest.Mock).mockReturnValue("test.mp3")

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.deferReply).toHaveBeenCalled()
            expect(downloadAudio).toHaveBeenCalled()
        })

        it("should handle download failures", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: false,
                error: "Download failed",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining("Error"),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it("should handle invalid URLs", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue("invalid-url")

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining("Invalid URL"),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it("should handle YouTube playlist downloads", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/playlist?list=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: true,
                filePath: "/downloads/playlist.zip",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(downloadVideo).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: "https://youtube.com/playlist?list=test",
                }),
            )
        })

        it("should handle Spotify URL downloads", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://open.spotify.com/track/test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: true,
                filePath: "/downloads/spotify-track.mp4",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(downloadVideo).toHaveBeenCalled()
        })
    })

    describe("Download Progress Integration", () => {
        it("should show download progress", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockImplementation(async () => {
                // Simulate progress updates
                await new Promise((resolve) => setTimeout(resolve, 100))
                return { success: true, filePath: "/downloads/test.mp4" }
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining("Downloading"),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe("File Management Integration", () => {
        it("should handle file size limits", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: false,
                error: "File too large",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining("File too large"),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it("should handle storage space issues", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: false,
                error: "Insufficient storage space",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining("storage space"),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })

    describe("Error Handling Integration", () => {
        it("should handle network timeouts", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockRejectedValue(
                new Error("Network timeout"),
            )

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining("Error"),
                            }),
                        }),
                    ]),
                }),
            )
        })

        it("should handle yt-dlp errors", async () => {
            mockInteraction.commandName = "download"
            mockInteraction.options.getString.mockReturnValue(
                "https://youtube.com/watch?v=test",
            )
            mockInteraction.options.getBoolean.mockReturnValue(false)

            const { downloadVideo } = await import(
                "../../src/utils/download/downloadVideo"
            )
            ;(downloadVideo as jest.Mock).mockResolvedValue({
                success: false,
                error: "yt-dlp: Video unavailable",
            })

            const downloadCommand = await import(
                "../../src/functions/download/commands/download"
            )

            await downloadCommand.default.execute({
                client: mockClient,
                interaction: mockInteraction,
            })

            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                description:
                                    expect.stringContaining(
                                        "Video unavailable",
                                    ),
                            }),
                        }),
                    ]),
                }),
            )
        })
    })
})
