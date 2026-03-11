import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
    title: string
    description?: string
    eyebrow?: string
    actions?: ReactNode
    className?: string
}

export default function SectionHeader({
    title,
    description,
    eyebrow,
    actions,
    className,
}: SectionHeaderProps) {
    return (
        <header className={cn('flex items-start justify-between gap-4', className)}>
            <div className='space-y-2'>
                {eyebrow && <p className='type-meta text-lucky-text-tertiary'>{eyebrow}</p>}
                <h1 className='type-h1 text-lucky-text-primary'>{title}</h1>
                {description && (
                    <p className='type-body text-lucky-text-secondary max-w-3xl'>
                        {description}
                    </p>
                )}
            </div>
            {actions && <div className='shrink-0'>{actions}</div>}
        </header>
    )
}
