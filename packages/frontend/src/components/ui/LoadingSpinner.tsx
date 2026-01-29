import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg'
    className?: string
    message?: string
}

const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
}

function LoadingSpinner({
    size = 'md',
    className,
    message,
}: LoadingSpinnerProps) {
    return (
        <div className={cn('flex flex-col items-center gap-2', className)}>
            <Loader2
                className={cn(
                    'text-primary animate-spin',
                    sizeClasses[size],
                )}
            />
            {message && (
                <p className='text-sm text-text-secondary'>{message}</p>
            )}
        </div>
    )
}

export default LoadingSpinner
