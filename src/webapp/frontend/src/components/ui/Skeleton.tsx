import { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded bg-bg-tertiary', className)}
      {...props}
    />
  )
}

export default Skeleton
