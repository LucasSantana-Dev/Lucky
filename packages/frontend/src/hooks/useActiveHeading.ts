import { useEffect, useState } from 'react'

/**
 * Tracks which of the supplied heading IDs is currently most visible in the
 * viewport. Returns its ID, or null when nothing is visible.
 *
 * Used by docs/changelog/legal pages to drive the right-rail TOC active state.
 */
export function useActiveHeading(ids: string[]): string | null {
    const [activeId, setActiveId] = useState<string | null>(null)

    useEffect(() => {
        if (!ids.length) return
        const els = ids
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => Boolean(el))
        if (!els.length) return

        const obs = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    )
                if (visible[0]) setActiveId(visible[0].target.id)
            },
            { rootMargin: '-80px 0px -65% 0px', threshold: 0.1 },
        )
        els.forEach((el) => obs.observe(el))
        return () => obs.disconnect()
    }, [ids])

    return activeId
}
