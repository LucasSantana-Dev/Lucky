/**
 * Base result pattern for consistent error handling
 */

export interface BaseResult<T = unknown> {
    success: boolean
    data?: T
    error?: Error
    message?: string
}

export class Result<T = unknown> {
    private constructor(
        public readonly success: boolean,
        public readonly data?: T,
        public readonly error?: Error,
        public readonly message?: string,
    ) {}

    static success<T>(data?: T, message?: string): Result<T> {
        return new Result(true, data, undefined, message)
    }

    static failure<T>(error: Error | string, message?: string): Result<T> {
        const errorObj = typeof error === 'string' ? new Error(error) : error
        return new Result<T>(false, undefined, errorObj, message)
    }

    isSuccess(): boolean {
        return this.success
    }

    isFailure(): boolean {
        return !this.success
    }

    getData(): T | undefined {
        return this.data
    }

    getError(): Error | undefined {
        return this.error
    }

    getMessage(): string | undefined {
        return this.message
    }

    map<U>(fn: (data: T) => U): Result<U> {
        if (this.isFailure()) {
            return Result.failure(this.error ?? new Error('Unknown error'), this.message)
        }
        try {
            const newData = fn(this.data as T)
            return Result.success(newData, this.message)
        } catch (error) {
            return Result.failure(error as Error, this.message)
        }
    }

    flatMap<U>(fn: (data: T) => Result<U>): Result<U> {
        if (this.isFailure()) {
            return Result.failure(this.error ?? new Error('Unknown error'), this.message)
        }
        return fn(this.data as T)
    }
}
