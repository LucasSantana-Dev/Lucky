import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    hover?: boolean
    interactive?: boolean
    glow?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, hover = false, interactive = false, glow = false, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    'bg-lucky-bg-secondary border border-lucky-border rounded-xl',
                    'shadow-[0_4px_24px_rgb(7_2_20/0.3)]',
                    'transition-all duration-220 ease-out',
                    hover && [
                        'hover:border-lucky-border-strong',
                        'hover:shadow-[0_8px_32px_rgb(139_92_246/0.12),0_4px_24px_rgb(7_2_20/0.3)]',
                    ],
                    interactive && [
                        'cursor-pointer',
                        'hover:border-lucky-border-strong',
                        'hover:shadow-[0_8px_40px_rgb(139_92_246/0.15),0_4px_24px_rgb(7_2_20/0.3)]',
                        'hover:-translate-y-0.5',
                        'active:translate-y-0 active:shadow-[0_4px_24px_rgb(7_2_20/0.3)]',
                    ],
                    glow && [
                        'border-purple-500/30',
                        'shadow-[0_0_0_1px_rgb(139_92_246/0.15),0_4px_24px_rgb(139_92_246/0.12),0_12px_40px_rgb(7_2_20/0.3)]',
                    ],
                    className,
                )}
                {...props}
            />
        )
    },
)

Card.displayName = 'Card'

export default Card
