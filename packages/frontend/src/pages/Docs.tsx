import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMetadata } from '@/hooks/usePageMetadata'
import DocsShell from '@/components/DocsShell/DocsShell'
import { NAV, PAGES, type DocsPage } from '@/data/docsContent'

function pageFromSlug(slug: string | null): DocsPage {
    return PAGES.find((p) => p.slug === slug) ?? PAGES[0]!
}

export default function Docs() {
    const [searchParams] = useSearchParams()
    const page = useMemo(
        () => pageFromSlug(searchParams.get('page')),
        [searchParams],
    )

    usePageMetadata({
        title: `${page.title} — Lucky docs`,
        description: `${page.title} documentation for Lucky, the open-source self-hostable Discord bot.`,
    })

    const Content = page.content

    return (
        <DocsShell
            nav={NAV}
            breadcrumb={page.breadcrumb}
            title={page.title}
            toc={page.toc}
        >
            <Content />
        </DocsShell>
    )
}
