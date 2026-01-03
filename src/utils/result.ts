/**
 * Result type implementation for better error handling
 * Following functional programming patterns and avoiding exceptions
 */

import type { Result } from '../types/common'

export const createSuccess = <T>(data: T): Result<T, never> => ({
    success: true,
    data,
})

export const createFailure = <E>(error: E): Result<never, E> => ({
    success: false,
    error,
})

export const isSuccess = <T, E>(
    result: Result<T, E>,
): result is { success: true; data: T } => result.success

export const isFailure = <T, E>(
    result: Result<T, E>,
): result is { success: false; error: E } => !result.success

export const map = <T, U, E>(
    result: Result<T, E>,
    fn: (data: T) => U,
): Result<U, E> => {
    if (isSuccess(result)) {
        return createSuccess(fn(result.data))
    }
    return result as Result<U, E>
}

export const mapError = <T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F,
): Result<T, F> => {
    if (isFailure(result)) {
        return createFailure(fn(result.error))
    }
    return result as Result<T, F>
}

export const flatMap = <T, U, E>(
    result: Result<T, E>,
    fn: (data: T) => Result<U, E>,
): Result<U, E> => {
    if (isSuccess(result)) {
        return fn(result.data)
    }
    return result as Result<U, E>
}

export const getOrElse = <T, E>(result: Result<T, E>, defaultValue: T): T => {
    if (isSuccess(result)) {
        return result.data
    }
    return defaultValue
}

export const getOrThrow = <T, E>(result: Result<T, E>): T => {
    if (isSuccess(result)) {
        return result.data
    }
    if (isFailure(result)) {
        throw result.error
    }
    throw new Error('Invalid result state')
}
