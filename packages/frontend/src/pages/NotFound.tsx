import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SearchX } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { usePageMetadata } from '@/hooks/usePageMetadata'

export default function NotFoundPage() {
    const { t } = useTranslation()
    usePageMetadata({
        title: 'Page not found - Lucky',
        description: 'The page you are looking for does not exist.',
    })

    return (
        <main className='flex min-h-[64vh] items-center justify-center bg-lucky-bg-primary px-4'>
            <EmptyState
                headingLevel='h1'
                icon={<SearchX className='h-10 w-10' aria-hidden='true' />}
                title={t('notFound.title')}
                description={t('notFound.description')}
                action={
                    <Link
                        to='/'
                        className='lucky-focus-visible text-lucky-brand-text underline'
                    >
                        {t('notFound.backHome')}
                    </Link>
                }
            />
        </main>
    )
}
