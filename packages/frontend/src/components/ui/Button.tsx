import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'destructive'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = 'primary',
            size = 'md',
            loading = false,
            disabled,
            children,
            ...props
        },
        ref,
    ) => {
        return (
            <button
                ref={ref}
                className={cn(
                    'relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-all duration-150',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
                    'active:scale-[0.98]',
                    {
                        'bg-lucky-brand text-white hover:bg-lucky-brand-strong':
                            variant === 'primary' || variant === 'accent',
                        'bg-lucky-bg-tertiary border border-lucky-border text-lucky-text-primary hover:border-lucky-border-strong hover:bg-lucky-bg-active':
                            variant === 'secondary',
                        'bg-transparent hover:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-lucky-text-primary':
                            variant === 'ghost',
                        'bg-lucky-error hover:bg-red-600 text-white':
                            variant === 'destructive',
                        'px-3 py-1.5 text-sm': size === 'sm',
                        'px-4 py-2 text-sm': size === 'md',
                        'px-5 py-2.5 text-base': size === 'lg',
                    },
                    className,
                )}
                disabled={disabled || loading}
                aria-busy={loading}
                {...props}
            >
                {loading && (
                    <Loader2
                        className='h-4 w-4 animate-spin'
                        aria-hidden='true'
                    />
                )}
                {children}
            </button>
        )
    },
)

Button.displayName = 'Button'

export default Button
