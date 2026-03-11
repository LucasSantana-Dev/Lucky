import { type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatTone = 'brand' | 'accent' | 'success' | 'warning' | 'neutral'

const toneClass: Record<StatTone, string> = {
    brand: 'bg-lucky-brand/20 text-lucky-brand',
    accent: 'bg-lucky-accent/20 text-lucky-accent',
    success: 'bg-lucky-success/20 text-lucky-success',
    warning: 'bg-lucky-warning/20 text-lucky-warning',
    neutral: 'bg-lucky-bg-active text-lucky-text-secondary',
}

interface StatTileProps {
    label: string
    value: string | number
    icon?: ReactNode
    delta?: number
    tone?: StatTone
    className?: string
}

export default function StatTile({
    label,
    value,
    icon,
    delta,
    tone = 'neutral',
    className,
}: StatTileProps) {
    return (
        <article className={cn('surface-panel space-y-3 p-5', className)}>
            <div className='flex items-center justify-between gap-2'>
                <p className='type-body-sm text-lucky-text-tertiary'>{label}</p>
                {icon && <span className={cn('rounded-xl p-2', toneClass[tone])}>{icon}</span>}
            </div>
            <p className='type-h2 text-lucky-text-primary'>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {delta !== undefined && (
                <p
                    className={cn(
                        'type-body-sm inline-flex items-center gap-1.5',
                        delta >= 0 ? 'text-lucky-success' : 'text-lucky-error',
                    )}
                >
                    {delta >= 0 ? <TrendingUp className='h-3.5 w-3.5' /> : <TrendingDown className='h-3.5 w-3.5' />}
                    {Math.abs(delta)}%
                </p>
            )}
        </article>
    )
}
