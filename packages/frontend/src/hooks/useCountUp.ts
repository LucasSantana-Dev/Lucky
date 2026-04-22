import { useState, useEffect } from 'react'

interface UseCountUpOptions {
    duration?: number
    delay?: number
}

/**
 * Hook to animate a count from 0 to a target value
 * Uses requestAnimationFrame for smooth animation
 */
export function useCountUp(
    targetValue: number,
    { duration = 1000, delay = 0 }: UseCountUpOptions = {},
) {
    const [value, setValue] = useState(0)
    const [isComplete, setIsComplete] = useState(false)

    useEffect(() => {
        let animationFrameId: number | undefined
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        let cancelled = false

        setValue(0)
        setIsComplete(false)

        const animate = () => {
            if (cancelled) {
                return
            }

            const startTime = Date.now()

            const step = () => {
                if (cancelled) {
                    return
                }

                const now = Date.now()

                const elapsed = now - startTime
                const progress = Math.min(elapsed / duration, 1)

                // Easing function: ease-out cubic
                const easeProgress =
                    1 - Math.pow(1 - progress, 3)

                const currentValue = Math.floor(
                    easeProgress * targetValue,
                )

                setValue(currentValue)

                if (progress < 1) {
                    animationFrameId = requestAnimationFrame(step)
                } else {
                    setValue(targetValue)
                    setIsComplete(true)
                }
            }

            animationFrameId = requestAnimationFrame(step)
        }

        if (delay > 0) {
            timeoutId = setTimeout(animate, delay)
        } else {
            animate()
        }

        return () => {
            cancelled = true

            if (animationFrameId !== undefined) {
                cancelAnimationFrame(animationFrameId)
            }
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId)
            }
        }
    }, [targetValue, duration, delay])

    return { value, isComplete }
}
