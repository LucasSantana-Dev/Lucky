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
                    'relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
                    'active:scale-[0.97]',
                    {
                        'bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-[0_2px_12px_rgb(139_92_246/0.35)] hover:shadow-[0_4px_20px_rgb(139_92_246/0.5)] hover:from-purple-400 hover:to-purple-600':
                            variant === 'primary',
                        'bg-lucky-bg-tertiary border border-lucky-border text-lucky-text-primary hover:border-lucky-border-strong hover:bg-lucky-bg-active hover:text-white':
                            variant === 'secondary',
                        'bg-gradient-to-br from-yellow-500 to-amber-600 text-black shadow-[0_2px_12px_rgb(212_160_23/0.4)] hover:shadow-[0_4px_20px_rgb(212_160_23/0.6)] hover:from-yellow-400 hover:to-amber-500':
                            variant === 'accent',
                        'bg-transparent hover:bg-lucky-bg-tertiary text-lucky-text-secondary hover:text-white':
                            variant === 'ghost',
                        'bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-[0_2px_12px_rgb(239_68_68/0.3)] hover:shadow-[0_4px_20px_rgb(239_68_68/0.45)]':
                            variant === 'destructive',
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
