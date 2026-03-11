import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    title: string
    description: string
    icon?: ReactNode
    action?: ReactNode
    className?: string
}

export default function EmptyState({
    title,
    description,
    icon,
    action,
    className,
}: EmptyStateProps) {
    return (
        <section
            className={cn(
                'surface-panel flex min-h-[240px] flex-col items-center justify-center px-6 py-8 text-center',
                className,
            )}
        >
            {icon && (
                <div className='mb-4 rounded-2xl bg-lucky-bg-active/60 p-4 text-lucky-text-secondary'>
                    {icon}
                </div>
            )}
            <h2 className='type-h2 text-lucky-text-primary'>{title}</h2>
            <p className='mt-2 max-w-lg type-body text-lucky-text-secondary'>{description}</p>
            {action && <div className='mt-5'>{action}</div>}
        </section>
    )
}
