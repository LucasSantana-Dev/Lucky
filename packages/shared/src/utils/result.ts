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
