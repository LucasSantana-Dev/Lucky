import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ShellProps {
    children: ReactNode
    className?: string
    contentClassName?: string
}

export default function Shell({
    children,
    className,
    contentClassName,
}: ShellProps) {
    return (
        <div className={cn('lucky-shell bg-lucky-bg-primary', className)}>
            <div
                className={cn(
                    'mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 lg:px-10',
                    contentClassName,
                )}
            >
                {children}
            </div>
        </div>
    )
}
