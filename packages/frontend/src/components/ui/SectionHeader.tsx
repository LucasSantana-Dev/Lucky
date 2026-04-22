import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusBandTone =
    | 'success'
    | 'brand'
    | 'accent'
    | 'warning'
    | 'error'
    | 'muted'

export interface StatusBandTile {
    id?: string
    label: string
    status: string
    icon?: ReactNode
    tone?: StatusBandTone
}

const TONE_TEXT: Record<StatusBandTone, string> = {
    success: 'text-lucky-success',
    brand: 'text-lucky-brand',
    accent: 'text-lucky-brand-strong',
    warning: 'text-lucky-warning',
    error: 'text-lucky-error',
    muted: 'text-lucky-text-tertiary',
}

interface SectionHeaderProps {
    title: string
    description?: string
    eyebrow?: string
    eyebrowIcon?: ReactNode
    actions?: ReactNode
    statusBand?: StatusBandTile[]
    className?: string
}

export default function SectionHeader({
    title,
    description,
    eyebrow,
    eyebrowIcon,
    actions,
    statusBand,
    className,
}: SectionHeaderProps) {
    return (
        <div className={cn('space-y-4', className)}>
            <header className='flex items-start justify-between gap-4'>
                <div className='space-y-1'>
                    {eyebrow && (
                        <p className='type-meta inline-flex items-center gap-2 text-lucky-text-subtle'>
                            {eyebrowIcon && (
                                <span
                                    className='inline-flex h-4 w-4 shrink-0 items-center justify-center text-lucky-text-tertiary'
                                    aria-hidden='true'
                                >
                                    {eyebrowIcon}
                                </span>
                            )}
                            <span>{eyebrow}</span>
                        </p>
                    )}
                    <h1 className='type-h1 text-lucky-text-primary'>{title}</h1>
                    {description && (
                        <p className='type-body text-lucky-text-secondary max-w-3xl'>
                            {description}
                        </p>
                    )}
                </div>
                {actions && <div className='shrink-0'>{actions}</div>}
            </header>

            {statusBand && statusBand.length > 0 && (
                <div
                    className='grid grid-cols-2 gap-2 rounded-2xl border border-panel bg-sidebar p-1 md:grid-cols-4'
                    role='list'
                    aria-label='Module status'
                >
                    {statusBand.map((tile, index) => {
                        const toneClass = TONE_TEXT[tile.tone ?? 'muted']
                        return (
                            <div
                                key={tile.id ?? `${tile.label}:${tile.status}:${index}`}
                                role='listitem'
                                className='group flex items-center gap-3 rounded-xl border border-transparent bg-canvas/30 p-3 transition-colors hover:border-panel'
                            >
                                {tile.icon && (
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-panel bg-elevated transition-colors group-hover:bg-highlight',
                                            toneClass,
                                        )}
                                        aria-hidden='true'
                                    >
                                        {tile.icon}
                                    </span>
                                )}
                                <div className='min-w-0'>
                                    <p className='text-[10px] font-mono uppercase tracking-widest leading-none text-lucky-text-tertiary'>
                                        {tile.label}
                                    </p>
                                    <p
                                        className={cn(
                                            'mt-1 text-xs font-bold leading-none',
                                            toneClass,
                                        )}
                                    >
                                        {tile.status}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
