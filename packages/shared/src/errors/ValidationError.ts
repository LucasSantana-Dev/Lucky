/** Validation error that can be thrown from shared services and caught by backend or bot. */
export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly details?: unknown,
    ) {
        super(message)
        this.name = 'ValidationError'
    }
}
