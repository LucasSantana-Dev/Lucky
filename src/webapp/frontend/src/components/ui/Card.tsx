import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const Card = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('bg-bg-secondary border border-bg-border rounded-lg', className)}
      {...props}
    />
  )
})

Card.displayName = 'Card'

export default Card
