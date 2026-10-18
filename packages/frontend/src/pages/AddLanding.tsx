import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import { normalizeLandingSource } from '@lucky/shared/constants'
import { usePageMetadata } from '@/hooks/usePageMetadata'

/**
 * Per-source landing page (#2750), served at `/add?source=topgg` and
 * `/l/topgg`. The Add button goes through `/api/add`, which puts the source
 * in the OAuth `state` so the join can be tied to it. The source is validated
 * against the shared allowlist and never rendered.
 */
export default function AddLandingPage() {
    const { t } = useTranslation()
    const { source: pathSource } = useParams()
    const [searchParams] = useSearchParams()
    usePageMetadata({
        title: t('landing.meta.title'),
        description: t('landing.meta.description'),
    })

    const source = normalizeLandingSource(
        pathSource ?? searchParams.get('source'),
    )
    const addHref = `/api/add?source=${encodeURIComponent(source)}`

    return (
        <main className='lucky-shell dark flex min-h-screen flex-col items-center justify-center gap-6 bg-lucky-surface-canvas px-4 text-center text-white'>
            <h1 className='text-4xl font-bold md:text-5xl'>
                <span className='block'>{t('landing.hero.headlineLine1')}</span>
                <span className='block text-lucky-brand-text'>
                    {t('landing.hero.headlineLine2')}
                </span>
            </h1>
            <p className='max-w-[52ch] text-base text-lucky-text-body md:text-lg'>
                {t('landing.hero.subtitle')}
            </p>
            <a
                href={addHref}
                className='group inline-flex h-11 items-center justify-center gap-2 rounded-md bg-lucky-brand-strong px-5 font-semibold text-white hover:bg-lucky-brand-deep transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucky-focus focus-visible:ring-offset-2 focus-visible:ring-offset-lucky-surface-canvas'
            >
                {t('landing.hero.ctaPrimary')}
                <ArrowUpRight size={15} aria-hidden />
            </a>
        </main>
    )
}
