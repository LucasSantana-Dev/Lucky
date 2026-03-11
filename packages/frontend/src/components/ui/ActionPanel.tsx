import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ActionPanelProps {
    title: string
    description: string
    icon?: ReactNode
    action?: ReactNode
    className?: string
}

export default function ActionPanel({
    title,
    description,
    icon,
    action,
    className,
}: ActionPanelProps) {
    return (
        <section className={cn('surface-card p-5', className)}>
            <div className='flex items-start justify-between gap-4'>
                <div className='space-y-2'>
                    <div className='flex items-center gap-2'>
                        {icon && <span className='text-lucky-accent'>{icon}</span>}
                        <h3 className='type-title text-lucky-text-primary'>{title}</h3>
                    </div>
                    <p className='type-body-sm text-lucky-text-secondary'>{description}</p>
                </div>
                {action && <div className='shrink-0'>{action}</div>}
            </div>
        </section>
    )
}
