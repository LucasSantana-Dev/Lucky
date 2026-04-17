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
        let animationFrameId: number
        let timeoutId: ReturnType<typeof setTimeout> | undefined

        const animate = () => {
            const startTime = Date.now()
            const delayedStartTime = startTime + delay

            const step = () => {
                const now = Date.now()

                if (now < delayedStartTime) {
                    // Still in delay period
                    animationFrameId = requestAnimationFrame(step)
                    return
                }

                const elapsed = now - delayedStartTime
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
            cancelAnimationFrame(animationFrameId)
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
        }
    }, [targetValue, duration, delay])

    return { value, isComplete }
}
