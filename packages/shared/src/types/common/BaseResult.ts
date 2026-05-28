/**
 * Base result pattern for consistent error handling
 */

export interface BaseResult<T = unknown> {
    success: boolean
    data?: T
    error?: Error
    message?: string
}

/** Generic result type for operations that may succeed or fail with data or error. */
export class Result<T = unknown> {
    private constructor(
        public readonly success: boolean,
        public readonly data?: T,
        public readonly error?: Error,
        public readonly message?: string,
    ) {}

    /** Creates a successful result with optional data. */
    static success<T>(data?: T, message?: string): Result<T> {
        return new Result(true, data, undefined, message)
    }

    /** Creates a failed result with an error and optional message. */
    static failure<T>(error: Error | string, message?: string): Result<T> {
        const errorObj = typeof error === 'string' ? new Error(error) : error
        return new Result<T>(false, undefined, errorObj, message)
    }

    /** Returns true if this result represents a successful operation. */
    isSuccess(): boolean {
        return this.success
    }

    /** Returns true if this result represents a failed operation. */
    isFailure(): boolean {
        return !this.success
    }

    /** Returns the wrapped data if successful, otherwise undefined. */
    getData(): T | undefined {
        return this.data
    }

    /** Returns the error object if failed, otherwise undefined. */
    getError(): Error | undefined {
        return this.error
    }

    /** Returns the optional message associated with this result. */
    getMessage(): string | undefined {
        return this.message
    }

    /** Applies a transformation function to the data if successful, propagates failure. */
    map<U>(fn: (data: T) => U): Result<U> {
        if (this.isFailure()) {
            return Result.failure(
                this.error ?? new Error('Unknown error'),
                this.message,
            )
        }
        try {
            const newData = fn(this.data as T)
            return Result.success(newData, this.message)
        } catch (error) {
            return Result.failure(error as Error, this.message)
        }
    }

    /** Chains a result-producing operation on success, propagates failure. */
    flatMap<U>(fn: (data: T) => Result<U>): Result<U> {
        if (this.isFailure()) {
            return Result.failure(
                this.error ?? new Error('Unknown error'),
                this.message,
            )
        }
        return fn(this.data as T)
    }
}
