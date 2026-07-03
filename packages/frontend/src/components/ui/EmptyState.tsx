import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    title: string
    description: string
    icon?: ReactNode
    action?: ReactNode
    className?: string
    /**
     * Render without the panel chrome (no surface background, border, or
     * centered max-width) so the empty state sits flush inside a container
     * that already provides its own surface — e.g. embedded in a table Card.
     */
    bare?: boolean
}

export default function EmptyState({
    title,
    description,
    icon,
    action,
    className,
    bare = false,
}: EmptyStateProps) {
    return (
        <section
            className={cn(
                'flex w-full min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center md:px-10 md:py-14',
                bare ? '' : 'surface-panel mx-auto max-w-2xl',
                className,
            )}
        >
            {icon && (
                <div
                    className='mb-6 flex items-center justify-center'
                    aria-hidden='true'
                >
                    <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary p-4 text-lucky-text-tertiary shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]'>
                        {icon}
                    </div>
                </div>
            )}
            <h2 className='type-h2 text-lucky-text-primary'>{title}</h2>
            <p className='mt-3 max-w-lg type-body text-lucky-text-secondary'>
                {description}
            </p>
            {action && <div className='mt-8 flex justify-center'>{action}</div>}
        </section>
    )
}
