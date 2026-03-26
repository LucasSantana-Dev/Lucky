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
                'surface-panel flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center',
                className,
            )}
        >
            {icon && (
                <div className='mb-5 flex items-center justify-center'>
                    <div className='rounded-xl border border-lucky-border bg-lucky-bg-tertiary p-4 text-lucky-text-tertiary'>
                        {icon}
                    </div>
                </div>
            )}
            <h2 className='type-h2 text-lucky-text-primary'>{title}</h2>
            <p className='mt-2 max-w-lg type-body text-lucky-text-secondary'>{description}</p>
            {action && <div className='mt-6'>{action}</div>}
        </section>
    )
}
