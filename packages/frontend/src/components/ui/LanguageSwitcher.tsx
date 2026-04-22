import { useTranslation } from 'react-i18next'
import { Check, Languages } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './dropdown-menu'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface LanguageSwitcherProps {
    variant?: 'header' | 'compact'
    className?: string
}

function resolveLanguage(language: string): SupportedLanguage {
    if (language.toLowerCase().startsWith('pt')) return 'pt-BR'
    return 'en'
}

export default function LanguageSwitcher({
    variant = 'header',
    className,
}: LanguageSwitcherProps) {
    const { t, i18n } = useTranslation()
    const active = resolveLanguage(i18n.resolvedLanguage ?? i18n.language)

    const triggerClass =
        variant === 'compact'
            ? 'lucky-focus-visible flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-lucky-text-subtle transition-colors hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary'
            : 'lucky-focus-visible flex items-center gap-2 rounded-md border border-lucky-border bg-lucky-bg-secondary px-3 py-1.5 text-lucky-text-secondary transition-colors hover:border-lucky-border-strong hover:bg-lucky-bg-tertiary hover:text-lucky-text-primary'

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className={cn(triggerClass, className)}
                aria-label={t('common.language')}
                title={t('common.language')}
            >
                <Languages className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                {variant === 'header' && (
                    <span className='type-body-sm'>
                        {t(`languages.${active}`)}
                    </span>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align='end'
                className='min-w-[160px] bg-lucky-bg-secondary border-lucky-border'
            >
                {SUPPORTED_LANGUAGES.map((lng) => (
                    <DropdownMenuItem
                        key={lng}
                        onSelect={() => {
                            void i18n.changeLanguage(lng)
                        }}
                        className='flex items-center justify-between gap-2 text-lucky-text-primary focus:bg-lucky-bg-tertiary'
                    >
                        <span className='type-body-sm'>
                            {t(`languages.${lng}`)}
                        </span>
                        {active === lng && (
                            <Check
                                className='h-3.5 w-3.5 text-lucky-brand'
                                aria-hidden='true'
                            />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
