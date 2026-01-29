import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  interactive?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-bg-secondary border border-bg-border rounded-lg',
          'transition-all duration-200 ease-out',
          hover && 'hover:border-primary/50 hover:shadow-md',
          interactive &&
            'cursor-pointer hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
          className,
        )}
        {...props}
      />
    )
  },
)

Card.displayName = 'Card'

export default Card
