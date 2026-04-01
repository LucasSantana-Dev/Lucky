export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
        public readonly details?: unknown,
    ) {
        super(message)
        this.name = 'AppError'
    }

    static badRequest(message: string, details?: unknown): AppError {
        return new AppError(400, message, details)
    }

    static unauthorized(message = 'Not authenticated'): AppError {
        return new AppError(401, message)
    }

    static forbidden(message = 'Forbidden'): AppError {
        return new AppError(403, message)
    }

    static notFound(message = 'Not found'): AppError {
        return new AppError(404, message)
    }

    static serviceUnavailable(message = 'Service unavailable'): AppError {
        return new AppError(503, message)
    }
}
