import { describe, test, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCountUp } from './useCountUp'

describe('useCountUp', () => {
    test('should initialize with value 0', () => {
        const { result } = renderHook(() => useCountUp(100))

        expect(result.current.value).toBe(0)
        expect(result.current.isComplete).toBe(false)
    })

    test('should animate to target value', async () => {
        const { result } = renderHook(() => useCountUp(100, { duration: 100 }))

        await new Promise((resolve) => setTimeout(resolve, 150))

        expect(result.current.value).toBeGreaterThan(0)
    })

    test('should handle small target values', () => {
        const { result } = renderHook(() => useCountUp(1, { duration: 100 }))

        expect(result.current.value).toBe(0)
    })

    test('should return value and isComplete properties', () => {
        const { result } = renderHook(() => useCountUp(100))

        expect(result.current).toHaveProperty('value')
        expect(result.current).toHaveProperty('isComplete')
        expect(typeof result.current.value).toBe('number')
        expect(typeof result.current.isComplete).toBe('boolean')
    })
})
