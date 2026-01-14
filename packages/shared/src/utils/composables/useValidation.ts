/**
 * Composable validation functions following functional programming patterns
 */

import type { Result } from '../../types/common'
import { createSuccess, createFailure } from '../result'

export const validateRequired = (
    value: unknown,
    fieldName: string,
): Result<string> => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return createFailure(new Error(`${fieldName} is required`))
    }
    return createSuccess(value.trim())
}

export const validateLength = (
    value: string,
    min: number,
    max: number,
    fieldName: string,
): Result<string> => {
    if (value.length < min) {
        return createFailure(
            new Error(`${fieldName} must be at least ${min} characters`),
        )
    }
    if (value.length > max) {
        return createFailure(
            new Error(`${fieldName} must be no more than ${max} characters`),
        )
    }
    return createSuccess(value)
}

export const validateUrl = (
    value: string,
    fieldName: string,
): Result<string> => {
    try {
        new URL(value)
        return createSuccess(value)
    } catch {
        return createFailure(new Error(`${fieldName} must be a valid URL`))
    }
}

export const validateNumber = (
    value: unknown,
    fieldName: string,
): Result<number> => {
    const num = Number(value)
    if (isNaN(num)) {
        return createFailure(new Error(`${fieldName} must be a valid number`))
    }
    return createSuccess(num)
}

export const validateRange = (
    value: number,
    min: number,
    max: number,
    fieldName: string,
): Result<number> => {
    if (value < min || value > max) {
        return createFailure(
            new Error(`${fieldName} must be between ${min} and ${max}`),
        )
    }
    return createSuccess(value)
}

export const validateGuildId = (value: string): Result<string> => {
    const guildIdRegex = /^\d{17,19}$/
    if (!guildIdRegex.test(value)) {
        return createFailure(new Error('Invalid guild ID format'))
    }
    return createSuccess(value)
}

export const validateUserId = (value: string): Result<string> => {
    const userIdRegex = /^\d{17,19}$/
    if (!userIdRegex.test(value)) {
        return createFailure(new Error('Invalid user ID format'))
    }
    return createSuccess(value)
}
