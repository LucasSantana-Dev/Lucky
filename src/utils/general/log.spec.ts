/**
 * Unit tests for logging utilities
 * Following quality rules: test behavior, not implementation
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals"
import {
    LogLevel,
    setLogLevel,
    errorLog,
    infoLog,
    successLog,
    warnLog,
    debugLog,
} from "./log"

describe("Log Utilities", () => {
    let consoleSpy: {
        error: jest.SpiedFunction<typeof console.error>
        info: jest.SpiedFunction<typeof console.info>
        log: jest.SpiedFunction<typeof console.log>
        warn: jest.SpiedFunction<typeof console.warn>
        debug: jest.SpiedFunction<typeof console.debug>
    }

    beforeEach(() => {
        consoleSpy = {
            error: jest.spyOn(console, "error").mockImplementation(() => {}),
            info: jest.spyOn(console, "info").mockImplementation(() => {}),
            log: jest.spyOn(console, "log").mockImplementation(() => {}),
            warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
            debug: jest.spyOn(console, "debug").mockImplementation(() => {}),
        }
        // Reset log level to DEBUG for each test
        setLogLevel(LogLevel.DEBUG)
    })

    describe("Log Level Control", () => {
        it("should respect log level filtering", () => {
            setLogLevel(LogLevel.ERROR)

            errorLog({ message: "Error message" })
            infoLog({ message: "Info message" })

            expect(consoleSpy.error).toHaveBeenCalled()
            expect(consoleSpy.info).not.toHaveBeenCalled()
        })

        it("should allow all logs at DEBUG level", () => {
            setLogLevel(LogLevel.DEBUG)

            errorLog({ message: "Error" })
            warnLog({ message: "Warning" })
            infoLog({ message: "Info" })
            successLog({ message: "Success" })
            debugLog({ message: "Debug" })

            expect(consoleSpy.error).toHaveBeenCalled()
            expect(consoleSpy.warn).toHaveBeenCalled()
            expect(consoleSpy.info).toHaveBeenCalled()
            expect(consoleSpy.log).toHaveBeenCalled()
            expect(consoleSpy.debug).toHaveBeenCalled()
        })
    })

    describe("Error Logging", () => {
        it("should log error messages with proper formatting", () => {
            errorLog({ message: "Test error" })

            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining("Test error"),
            )
        })

        it("should handle Error objects", () => {
            const testError = new Error("Test error message")
            errorLog({ message: "Operation failed", error: testError })

            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining("Operation failed"),
            )
        })

        it("should include additional data when provided", () => {
            errorLog({
                message: "Validation failed",
                data: { field: "email", value: "invalid" },
            })

            expect(consoleSpy.error).toHaveBeenCalledWith(
                expect.stringContaining("Validation failed"),
            )
        })
    })

    describe("Info Logging", () => {
        it("should log info messages", () => {
            infoLog({ message: "Process started" })

            expect(consoleSpy.info).toHaveBeenCalledWith(
                expect.stringContaining("Process started"),
            )
        })

        it("should include data when provided", () => {
            infoLog({
                message: "User action",
                data: { userId: "123", action: "login" },
            })

            expect(consoleSpy.info).toHaveBeenCalledWith(
                expect.stringContaining("User action"),
            )
        })
    })

    describe("Success Logging", () => {
        it("should log success messages", () => {
            successLog({ message: "Operation completed" })

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining("Operation completed"),
            )
        })
    })

    describe("Warning Logging", () => {
        it("should log warning messages", () => {
            warnLog({ message: "Deprecated feature used" })

            expect(consoleSpy.warn).toHaveBeenCalledWith(
                expect.stringContaining("Deprecated feature used"),
            )
        })
    })

    describe("Debug Logging", () => {
        it("should log debug messages only at DEBUG level", () => {
            setLogLevel(LogLevel.DEBUG)
            debugLog({ message: "Debug information" })

            expect(consoleSpy.debug).toHaveBeenCalledWith(
                expect.stringContaining("Debug information"),
            )
        })

        it("should not log debug messages at INFO level", () => {
            setLogLevel(LogLevel.INFO)
            // Clear any previous calls
            consoleSpy.debug.mockClear()
            debugLog({ message: "Debug information" })

            expect(consoleSpy.debug).not.toHaveBeenCalled()
        })
    })

    describe("Log Level Constants", () => {
        it("should have correct log level hierarchy", () => {
            expect(LogLevel.ERROR).toBe(0)
            expect(LogLevel.WARN).toBe(1)
            expect(LogLevel.INFO).toBe(2)
            expect(LogLevel.SUCCESS).toBe(3)
            expect(LogLevel.DEBUG).toBe(4)
        })
    })
})
