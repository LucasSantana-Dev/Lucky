import { useRef, useCallback, useEffect } from 'react'

export function useDebounce<T extends (...args: Parameters<T>) => void>(
    fn: T,
    delay: number,
): (...args: Parameters<T>) => void {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fnRef = useRef(fn)
    fnRef.current = fn

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    return useCallback(
        (...args: Parameters<T>) => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => fnRef.current(...args), delay)
        },
        [delay],
    )
}
