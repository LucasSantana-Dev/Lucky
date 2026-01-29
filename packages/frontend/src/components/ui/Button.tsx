import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          {
            'bg-primary hover:bg-primary/90 text-text-primary': variant === 'primary',
            'bg-secondary hover:bg-secondary/90 text-text-primary': variant === 'secondary',
            'bg-accent hover:bg-accent/90 text-text-primary': variant === 'accent',
            'bg-transparent hover:bg-bg-tertiary text-text-primary': variant === 'ghost',
            'bg-destructive hover:bg-destructive/90 text-destructive-foreground': variant === 'destructive',
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-base': size === 'md',
            'px-6 py-3 text-lg': size === 'lg',
          },
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden="true" />
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export default Button
