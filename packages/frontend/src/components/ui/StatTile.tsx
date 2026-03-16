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

const toneGlowClass: Record<StatTone, string> = {
    brand: 'drop-shadow-[0_0_6px_rgb(139_92_246/0.6)]',
    accent: 'drop-shadow-[0_0_6px_rgb(212_160_23/0.6)]',
    success: 'drop-shadow-[0_0_6px_rgb(34_197_94/0.6)]',
    warning: 'drop-shadow-[0_0_6px_rgb(245_158_11/0.6)]',
    neutral: '',
}

const toneOverlayClass: Record<StatTone, string> = {
    brand: 'from-purple-500/5 to-transparent',
    accent: 'from-yellow-500/5 to-transparent',
    success: 'from-green-500/5 to-transparent',
    warning: 'from-orange-500/5 to-transparent',
    neutral: 'from-white/[0.02] to-transparent',
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
                'surface-panel relative space-y-3 p-5 overflow-hidden',
                className,
            )}
        >
            <div
                className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br rounded-xl opacity-60',
                    toneOverlayClass[tone],
                )}
                aria-hidden='true'
            />
            <div className='relative flex items-center justify-between gap-2'>
                <p className='type-body-sm text-lucky-text-tertiary'>{label}</p>
                {icon && (
                    <span
                        className={cn(
                            'rounded-xl p-2 transition-all duration-200',
                            toneClass[tone],
                            toneGlowClass[tone],
                        )}
                    >
                        {icon}
                    </span>
                )}
            </div>
            <p
                className='relative type-h2 text-lucky-text-primary animate-[fade-up_0.3s_ease-out]'
                style={{ animationFillMode: 'both' }}
            >
                {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {delta !== undefined && (
                <p
                    className={cn(
                        'relative type-body-sm inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
                        delta >= 0
                            ? 'bg-green-500/10 text-lucky-success'
                            : 'bg-red-500/10 text-lucky-error',
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
