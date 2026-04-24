import { type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

type StatTone = 'brand' | 'accent' | 'success' | 'warning' | 'neutral'

const toneIconClass: Record<StatTone, string> = {
    brand: 'bg-lucky-brand/15 text-lucky-brand',
    accent: 'bg-lucky-brand/15 text-lucky-brand',
    success: 'bg-lucky-success/15 text-lucky-success',
    warning: 'bg-lucky-warning/15 text-lucky-warning',
    neutral: 'bg-lucky-bg-active text-lucky-text-tertiary',
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
        <article
            className={cn(
                'surface-panel flex flex-col gap-4 p-5',
                className,
            )}
        >
            <div className='flex items-center justify-between gap-2'>
                <p className='type-meta text-lucky-text-tertiary'>{label}</p>
                {icon && (
                    <span
                        className={cn(
                            'rounded-lg p-2.5',
                            toneIconClass[tone],
                        )}
                    >
                        {icon}
                    </span>
                )}
            </div>
            <p
                className='type-h2 leading-tight text-lucky-text-primary'
            >
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {delta !== undefined && (
                <p
                    className={cn(
                        'type-body-sm inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-medium',
                        delta >= 0
                            ? 'bg-lucky-success/10 text-lucky-success'
                            : 'bg-lucky-error/10 text-lucky-error',
                    )}
                >
                    {delta >= 0 ? (
                        <TrendingUp className='h-3.5 w-3.5' />
                    ) : (
                        <TrendingDown className='h-3.5 w-3.5' />
                    )}
                    {Math.abs(delta)}%
                </p>
            )}
        </article>
    )
}
