/**
 * Integration tests for bot startup and initialization
 */

import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from "@jest/globals"
import { Client } from "discord.js"
import { Player } from "discord-player"

// Mock all external dependencies
jest.mock("discord.js")
jest.mock("discord-player")
jest.mock("../../../src/config/redis")
jest.mock("../../../src/utils/monitoring")

describe("Bot Initialization", () => {
    let mockClient: jest.Mocked<Client>
    let mockPlayer: jest.Mocked<Player>

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks()

        // Setup mock client
        mockClient = {
            login: jest.fn().mockResolvedValue({}),
            on: jest.fn(),
            user: { id: "test-bot-id", username: "TestBot" },
            commands: new Map(),
            player: {} as any,
        } as any

        // Setup mock player
        mockPlayer = {
            extractors: {
                register: jest.fn(),
            },
            search: jest.fn(),
            play: jest.fn(),
        } as any

        // Mock the Client constructor
        ;(Client as jest.MockedClass<typeof Client>).mockImplementation(
            () => mockClient,
        )
        ;(Player as jest.MockedClass<typeof Player>).mockImplementation(
            () => mockPlayer,
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe("Bot startup process", () => {
        it("should initialize bot with correct configuration", async () => {
            // Import after mocks are set up
            const { initializeBot } = await import("../../../src/bot/start")

            await initializeBot()

            expect(Client).toHaveBeenCalledWith({
                intents: expect.any(Number),
            })
            expect(mockClient.login).toHaveBeenCalledWith(
                process.env.DISCORD_TOKEN,
            )
        })

        it("should register event handlers", async () => {
            const { initializeBot } = await import("../../../src/bot/start")

            await initializeBot()

            expect(mockClient.on).toHaveBeenCalledWith(
                "ready",
                expect.any(Function),
            )
            expect(mockClient.on).toHaveBeenCalledWith(
                "interactionCreate",
                expect.any(Function),
            )
        })

        it("should handle startup errors gracefully", async () => {
            const consoleSpy = jest
                .spyOn(console, "error")
                .mockImplementation(() => {})

            mockClient.login.mockRejectedValue(new Error("Login failed"))

            const { initializeBot } = await import("../../../src/bot/start")

            await expect(initializeBot()).rejects.toThrow("Login failed")

            consoleSpy.mockRestore()
        })
    })

    describe("Player initialization", () => {
        it("should create player with correct configuration", async () => {
            const { createPlayer } = await import(
                "../../../src/handlers/playerHandler"
            )

            const player = createPlayer({ client: mockClient as any })

            expect(Player).toHaveBeenCalledWith(mockClient)
            expect(player).toBeDefined()
        })

        it("should register extractors", async () => {
            const { createPlayer } = await import(
                "../../../src/handlers/playerHandler"
            )

            createPlayer({ client: mockClient as any })

            expect(mockPlayer.extractors.register).toHaveBeenCalled()
        })
    })

    describe("Environment configuration", () => {
        it("should load environment variables correctly", () => {
            expect(process.env.DISCORD_TOKEN).toBe("test-token")
            expect(process.env.CLIENT_ID).toBe("test-client-id")
            expect(process.env.REDIS_HOST).toBe("localhost")
        })

        it("should handle missing environment variables", () => {
            const originalToken = process.env.DISCORD_TOKEN
            delete process.env.DISCORD_TOKEN

            // Should not throw during import
            expect(() => {
                require("../../../src/config/environment")
            }).not.toThrow()

            // Restore
            process.env.DISCORD_TOKEN = originalToken
        })
    })

    describe("Error handling during startup", () => {
        it("should handle Redis connection failures", async () => {
            const { loadEnvironment } = await import(
                "../../../src/config/environment"
            )

            // Should not throw even if Redis is unavailable
            expect(() => loadEnvironment()).not.toThrow()
        })

        it("should handle missing configuration gracefully", () => {
            const originalEnv = { ...process.env }

            // Clear environment
            Object.keys(process.env).forEach((key) => {
                if (key.startsWith("DISCORD_") || key.startsWith("REDIS_")) {
                    delete process.env[key]
                }
            })

            expect(() => {
                require("../../../src/config/environmentConfig")
            }).not.toThrow()

            // Restore environment
            Object.assign(process.env, originalEnv)
        })
    })
})
