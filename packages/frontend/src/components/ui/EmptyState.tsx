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
                'surface-panel relative flex min-h-[240px] flex-col items-center justify-center overflow-hidden px-6 py-10 text-center',
                className,
            )}
        >
            <div
                className='pointer-events-none absolute inset-0 bg-gradient-to-b from-purple-500/5 via-transparent to-transparent'
                aria-hidden='true'
            />
            {icon && (
                <div className='relative mb-5 flex items-center justify-center'>
                    <div
                        className='absolute h-16 w-16 rounded-full bg-purple-500/10 blur-xl'
                        aria-hidden='true'
                    />
                    <div className='relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-800/10 p-4 text-lucky-text-secondary shadow-[0_0_20px_rgb(139_92_246/0.15)]'>
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
