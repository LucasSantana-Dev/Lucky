import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCountUp } from './useCountUp'

describe('useCountUp', () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

    beforeEach(() => {
        vi.useFakeTimers()

        globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            const timeoutId = setTimeout(() => callback(Date.now()), 16)

            return timeoutId as unknown as number
        }) as typeof requestAnimationFrame

        globalThis.cancelAnimationFrame = ((animationFrameId: number) => {
            clearTimeout(animationFrameId as unknown as ReturnType<typeof setTimeout>)
        }) as typeof cancelAnimationFrame
    })

    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()

        globalThis.requestAnimationFrame = originalRequestAnimationFrame
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    })

    const advanceTimers = async (ms: number) => {
        await act(async () => {
            vi.advanceTimersByTime(ms)
        })
    }

    test('should initialize with value 0', () => {
        const { result } = renderHook(() => useCountUp(100))

        expect(result.current.value).toBe(0)
        expect(result.current.isComplete).toBe(false)
    })

    test('should delay the animation start once', async () => {
        const { result } = renderHook(() =>
            useCountUp(100, { duration: 100, delay: 50 }),
        )

        expect(result.current.value).toBe(0)
        expect(result.current.isComplete).toBe(false)

        await advanceTimers(50)
        expect(result.current.value).toBe(0)

        await advanceTimers(16)
        expect(result.current.value).toBeGreaterThan(0)
        expect(result.current.isComplete).toBe(false)
    })

    test('should complete the animation and set isComplete', async () => {
        const { result } = renderHook(() =>
            useCountUp(100, { duration: 100 }),
        )

        await advanceTimers(200)

        expect(result.current.value).toBe(100)
        expect(result.current.isComplete).toBe(true)
    })

    test('should reset state when the target changes', async () => {
        const { result, rerender } = renderHook(
            ({ targetValue }) =>
                useCountUp(targetValue, { duration: 100 }),
            {
                initialProps: { targetValue: 100 },
            },
        )

        await advanceTimers(32)

        expect(result.current.value).toBeGreaterThan(0)
        expect(result.current.value).toBeLessThan(100)

        rerender({ targetValue: 200 })

        expect(result.current.value).toBe(0)
        expect(result.current.isComplete).toBe(false)

        await advanceTimers(200)

        expect(result.current.value).toBe(200)
        expect(result.current.isComplete).toBe(true)
    })
})
