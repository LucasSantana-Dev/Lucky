/**
 * Utility functions to sanitize error messages for user-facing content
 * Prevents system paths and sensitive information from being exposed
 */

export function sanitizeErrorMessage(error: unknown): string {
    if (!error) return "An unknown error occurred"

    let errorMessage = ""

    if (error instanceof Error) {
        errorMessage = error.message
    } else if (typeof error === "string") {
        errorMessage = error
    } else if (typeof error === "object" && error !== null) {
        errorMessage = JSON.stringify(error)
    } else {
        errorMessage = String(error)
    }

    return sanitizeMessage(errorMessage)
}

export function sanitizeMessage(message: string): string {
    if (!message) return "An unknown error occurred"

    // Remove system paths (Windows and Unix style)
    let sanitized = message
        .replace(/[A-Z]:\\[^"]*\\/gi, "[SYSTEM_PATH]\\")
        .replace(/\/[^"]*\//g, "[SYSTEM_PATH]/")
        .replace(/C:\\[^"]*\\/gi, "[SYSTEM_PATH]\\")
        .replace(/\/c\/[^"]*\//gi, "[SYSTEM_PATH]/")

    // Remove specific error patterns that expose system information
    sanitized = sanitized
        .replace(/Cannot find module '[^']*'/g, "Required dependency not found")
        .replace(/Cannot read properties of undefined/g, "Configuration error")
        .replace(/spawn\([^)]*\)/g, "External process")
        .replace(/require\([^)]*\)/g, "Module loading")
        .replace(/Require stack:[^]*?(?=\n|$)/g, "")

    // Remove any remaining file paths
    sanitized = sanitized
        .replace(/at [^(]*\([^)]*\)/g, "at [INTERNAL_FUNCTION]")
        .replace(/at [^(]*\.[^:]*:[0-9]+:[0-9]+/g, "at [INTERNAL_LOCATION]")

    // Clean up multiple spaces and newlines
    sanitized = sanitized.replace(/\s+/g, " ").replace(/\n+/g, " ").trim()

    // If the message is too technical, provide a generic one
    if (
        sanitized.includes("[SYSTEM_PATH]") ||
        sanitized.includes("Cannot find module") ||
        sanitized.includes("spawn") ||
        sanitized.includes("require")
    ) {
        return "A system configuration error occurred. Please contact support if this persists."
    }

    return sanitized || "An unknown error occurred"
}

export function createUserFriendlyError(error: unknown): string {
    const sanitized = sanitizeErrorMessage(error)

    // Map common technical errors to user-friendly messages
    if (sanitized.includes("ffmpeg") || sanitized.includes("FFmpeg")) {
        return "Audio processing is currently unavailable. Please try again later."
    }

    if (sanitized.includes("download") || sanitized.includes("Download")) {
        return "Download failed. The content may be unavailable or restricted."
    }

    if (sanitized.includes("connection") || sanitized.includes("Connection")) {
        return "Connection error. Please check your internet connection and try again."
    }

    if (sanitized.includes("timeout") || sanitized.includes("Timeout")) {
        return "Request timed out. Please try again."
    }

    if (sanitized.includes("permission") || sanitized.includes("Permission")) {
        return "Permission denied. Please check your settings and try again."
    }

    return sanitized
}
