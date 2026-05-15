import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import PublicHeader from './PublicHeader'
import { useActiveHeading } from '@/hooks/useActiveHeading'

export type DocsNavItem = {
    label: string
    href: string
    external?: boolean
}

export type DocsNavGroup = {
    heading: string
    items: DocsNavItem[]
}

export type DocsTocItem = {
    id: string
    label: string
    depth?: 2 | 3
}

type Props = {
    nav: DocsNavGroup[]
    toc?: DocsTocItem[]
    breadcrumb: string
    title: string
    lastUpdated?: string
    children: ReactNode
}

export default function DocsShell({ nav, toc, breadcrumb, title, lastUpdated, children }: Props) {
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const activeId = useActiveHeading(toc?.map((t) => t.id) ?? [])

    useEffect(() => {
        setSidebarOpen(false)
    }, [location.pathname])

    return (
        <div className='min-h-screen bg-lucky-surface-canvas text-white'>
            <PublicHeader
                breadcrumb={breadcrumb}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />

            <div className='mx-auto grid max-w-7xl gap-0 px-0 md:px-6 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]'>
                <DocsSidebar nav={nav} open={sidebarOpen} />

                <main className='min-w-0 px-4 py-10 md:px-8 md:py-14 lg:px-10'>
                    <article className='mx-auto max-w-2xl'>
                        <header className='mb-10 border-b border-lucky-border-soft pb-6'>
                            <p className='mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                                {breadcrumb}
                            </p>
                            <h1 className='text-3xl font-bold tracking-tight text-lucky-text-strong md:text-4xl'>{title}</h1>
                            {lastUpdated ? (
                                <p className='mt-3 font-mono text-xs text-lucky-text-muted'>
                                    last updated: {lastUpdated}
                                </p>
                            ) : null}
                        </header>
                        <div className='docs-prose'>{children}</div>
                    </article>
                </main>

                {toc?.length ? <DocsToc toc={toc} activeId={activeId} /> : <div className='hidden lg:block' />}
            </div>
        </div>
    )
}

function DocsSidebar({ nav, open }: { nav: DocsNavGroup[]; open: boolean }) {
    const { pathname } = useLocation()

    return (
        <aside
            className={`${open ? 'block' : 'hidden'} lg:block border-r border-lucky-border-soft bg-lucky-surface-canvas`}
            aria-label='Documentation navigation'
        >
            <div className='sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-4 py-8 md:px-6'>
                <nav className='space-y-7'>
                    {nav.map((group) => (
                        <div key={group.heading}>
                            <h4 className='mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                                {group.heading}
                            </h4>
                            <ul className='space-y-0.5'>
                                {group.items.map((item) => {
                                    const isActive = !item.external && pathname === item.href
                                    const base =
                                        'group inline-flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors'
                                    const inactiveCls = `${base} text-lucky-text-body hover:bg-lucky-surface-panel hover:text-lucky-text-strong`
                                    const activeCls = `${base} bg-lucky-surface-panel text-lucky-text-strong shadow-[inset_2px_0_0_var(--color-lucky-brand)]`
                                    if (item.external) {
                                        return (
                                            <li key={item.href}>
                                                <a
                                                    href={item.href}
                                                    target='_blank'
                                                    rel='noreferrer'
                                                    className={inactiveCls}
                                                >
                                                    <span>{item.label}</span>
                                                    <ArrowUpRight size={11} aria-hidden className='text-lucky-text-muted' />
                                                </a>
                                            </li>
                                        )
                                    }
                                    return (
                                        <li key={item.href}>
                                            <Link to={item.href} className={isActive ? activeCls : inactiveCls}>
                                                <span>{item.label}</span>
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </div>
        </aside>
    )
}

function DocsToc({ toc, activeId }: { toc: DocsTocItem[]; activeId: string | null }) {
    return (
        <aside className='hidden lg:block' aria-label='On this page'>
            <div className='sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-6 py-10'>
                <h4 className='mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-lucky-text-muted'>
                    On this page
                </h4>
                <ul className='space-y-1.5 border-l border-lucky-border-soft pl-3'>
                    {toc.map((item) => {
                        const isActive = activeId === item.id
                        return (
                            <li key={item.id} className={item.depth === 3 ? 'pl-3' : ''}>
                                <a
                                    href={`#${item.id}`}
                                    className={`inline-block text-xs leading-snug transition-colors ${
                                        isActive
                                            ? 'text-lucky-brand font-medium'
                                            : 'text-lucky-text-muted hover:text-lucky-text-strong'
                                    }`}
                                >
                                    {item.label}
                                </a>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </aside>
    )
}
