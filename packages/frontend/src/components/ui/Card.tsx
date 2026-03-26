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
                    'bg-lucky-bg-secondary border border-lucky-border rounded-lg',
                    'shadow-[0_2px_12px_rgb(0_0_0/0.2)]',
                    'transition-colors duration-150',
                    hover && 'hover:border-lucky-border-strong',
                    interactive && [
                        'cursor-pointer',
                        'hover:border-lucky-border-strong',
                        'hover:-translate-y-px',
                        'active:translate-y-0',
                    ],
                    glow && 'border-lucky-brand/30',
                    className,
                )}
                {...props}
            />
        )
    },
)

Card.displayName = 'Card'

export default Card
